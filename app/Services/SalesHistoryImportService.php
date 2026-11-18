<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\Store;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * J8 — "Import past sales" (stores moving from notebook / Excel records). A CSV with columns
 *   date (YYYY-MM-DD or MM/DD/YYYY), product (the product NAME in the store, case-insensitive, or its id), quantity (> 0)
 * Two steps: parse() for the preview (counts + row numbers per problem), then import() of the valid rows only, under
 * one import_batch uuid (so one upload can be deleted again).
 */
class SalesHistoryImportService
{
    public const PROBLEMS = [
        'unknown_product' => 'Unknown product',
        'bad_date'        => 'Bad date',
        'future_date'     => 'Future date',
        'too_old'         => 'More than 5 years back',
        'bad_quantity'    => 'Quantity ≤ 0 / not a whole number',
    ];

    /**
     * @return array{valid: array<int, array{row: int, sold_on: string, product_id: int, quantity: int}>,
     *   preview: array<int, array>, counts: array<string, int>, problems: array<string, int[]>, period: ?array, rows: int, order_months: string[]}
     */
    public static function parse(Store $store, string $path, ?Carbon $today = null): array
    {
        $cfg = config('forecast.import');
        $today = ($today ?? now())->copy()->startOfDay();
        $oldest = $today->copy()->subYears((int) $cfg['max_years_back']);
        $products = Product::where('store_id', $store->id)->get();
        $byName = $products->groupBy(fn ($p) => mb_strtolower(trim($p->name)))->map->first();
        $byId = $products->keyBy('id');

        $fh = fopen($path, 'r');
        if (! $fh) {
            throw ValidationException::withMessages(['file' => 'The file could not be read.']);
        }
        $cols = ['date' => 0, 'product' => 1, 'quantity' => 2];
        $line = 0;
        $data = 0;
        $valid = $preview = [];
        $problems = array_fill_keys(array_keys(static::PROBLEMS), []);
        $counts = ['valid' => 0] + array_fill_keys(array_keys(static::PROBLEMS), 0);

        while (($raw = fgetcsv($fh, 0, ',', '"', '\\')) !== false) {
            $line++;
            if ($line === 1 && isset($raw[0])) {
                $raw[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $raw[0]);   // Excel's UTF-8 BOM
            }
            $cells = array_map(fn ($c) => trim((string) $c), $raw);
            if (count(array_filter($cells, fn ($c) => $c !== '')) === 0) {
                continue;   // blank line
            }
            // Header row: find the columns by name ("qty" is accepted for quantity)
            if ($line === 1 && in_array('date', array_map('strtolower', $cells), true)) {
                foreach ($cells as $i => $c) {
                    $k = strtolower($c);
                    $k = $k === 'qty' ? 'quantity' : $k;
                    if (isset($cols[$k])) {
                        $cols[$k] = $i;
                    }
                }
                continue;
            }
            if (++$data > (int) $cfg['max_rows']) {
                fclose($fh);
                throw ValidationException::withMessages(['file' => 'The file has more than ' . number_format((int) $cfg['max_rows']) . ' rows — split it into smaller files.']);
            }

            $dateText = $cells[$cols['date']] ?? '';
            $productText = $cells[$cols['product']] ?? '';
            $qtyText = $cells[$cols['quantity']] ?? '';
            $date = static::date($dateText);
            $product = ctype_digit($productText) && $byId->has((int) $productText) ? $byId->get((int) $productText) : $byName->get(mb_strtolower($productText));
            $problem = match (true) {
                $date === null                     => 'bad_date',
                $date->gt($today)                  => 'future_date',
                $date->lt($oldest)                 => 'too_old',
                $product === null                  => 'unknown_product',
                ! preg_match('/^\d+$/', $qtyText) || (int) $qtyText <= 0 => 'bad_quantity',
                default                            => null,
            };

            if ($problem) {
                $counts[$problem]++;
                if (count($problems[$problem]) < 50) {
                    $problems[$problem][] = $line;
                }
            } else {
                $counts['valid']++;
                $valid[] = ['row' => $line, 'sold_on' => $date->toDateString(), 'product_id' => $product->id, 'quantity' => (int) $qtyText];
            }
            if (count($preview) < (int) $cfg['preview_rows']) {
                $preview[] = ['row' => $line, 'date' => $dateText, 'product' => $productText, 'quantity' => $qtyText,
                    'matched' => $product?->name, 'problem' => $problem ? static::PROBLEMS[$problem] : null];
            }
        }
        fclose($fh);

        $dates = array_column($valid, 'sold_on');
        $months = array_values(array_unique(array_map(fn ($d) => substr($d, 0, 7), $dates)));

        return [
            'valid'        => $valid,
            'preview'      => $preview,
            'counts'       => $counts,
            'problems'     => array_filter($problems),
            'rows'         => $data,
            'period'       => $dates ? ['from' => min($dates), 'to' => max($dates)] : null,
            // The import warns: these months already have platform orders (both are added — make sure they're different sales)
            'order_months' => static::monthsWithOrders($store->id, $months),
        ];
    }

    /** "2025-12-31" or "12/31/2025" (strict, a real calendar date) → Carbon, else null. */
    public static function date(string $text): ?Carbon
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $text, $m)) {
            [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } elseif (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $text, $m)) {
            [$mo, $d, $y] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } else {
            return null;
        }

        return checkdate($mo, $d, $y) ? Carbon::create($y, $mo, $d)->startOfDay() : null;
    }

    /** @param string[] $months "YYYY-MM" */
    public static function monthsWithOrders(int $storeId, array $months): array
    {
        if (! $months) {
            return [];
        }
        sort($months);
        $from = Carbon::parse($months[0] . '-01');
        $to = Carbon::parse(end($months) . '-01')->addMonth();

        return DB::table('orders')->where('store_id', $storeId)->where('status', '!=', 'cancelled')->whereNull('deleted_at')
            ->where('created_at', '>=', $from)->where('created_at', '<', $to)
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m') AS ym")->distinct()->pluck('ym')
            ->filter(fn ($ym) => in_array($ym, $months, true))->sort()->values()->all();
    }

    /** Insert the valid rows under one new import_batch (chunked). Returns the batch uuid. */
    public static function import(Store $store, array $valid, ?int $userId): string
    {
        if (! $valid) {
            throw ValidationException::withMessages(['file' => 'There are no valid rows to import.']);
        }
        $batch = (string) Str::uuid();
        $products = Product::whereIn('id', array_unique(array_column($valid, 'product_id')))->get()->keyBy('id');
        $now = now();
        DB::transaction(function () use ($store, $valid, $userId, $batch, $products, $now) {
            foreach (array_chunk($valid, 1000) as $chunk) {
                SalesHistory::insert(array_map(fn ($r) => [
                    'store_id' => $store->id, 'product_id' => $r['product_id'], 'product_label' => $products[$r['product_id']]->name,
                    'size_group' => SalesHistory::sizeGroupOf($products[$r['product_id']]), 'sold_on' => $r['sold_on'], 'quantity' => $r['quantity'],
                    'source' => 'import', 'import_batch' => $batch, 'created_by' => $userId, 'created_at' => $now, 'updated_at' => $now,
                ], $chunk));
            }
        });

        return $batch;
    }

    /** Each upload: date, rows, units, period covered, by whom. */
    public static function imports(Store $store): array
    {
        $rows = SalesHistory::where('store_id', $store->id)->where('source', 'import')->whereNotNull('import_batch')
            ->groupBy('import_batch')
            ->selectRaw('import_batch, COUNT(*) AS n, SUM(quantity) AS units, MIN(sold_on) AS date_from, MAX(sold_on) AS date_to, MIN(created_at) AS imported_at, MAX(created_by) AS by_id')
            ->orderByDesc('imported_at')->get();
        $names = \App\Models\User::whereIn('id', $rows->pluck('by_id')->filter())->pluck('name', 'id');

        return $rows->map(fn ($r) => [
            'batch' => $r->import_batch, 'rows' => (int) $r->n, 'units' => (int) $r->units,
            'from' => Carbon::parse($r->date_from)->format('M j, Y'), 'to' => Carbon::parse($r->date_to)->format('M j, Y'),
            'imported_at' => Carbon::parse($r->imported_at)->format('M j, Y g:i A'), 'by' => $names[$r->by_id] ?? null,
        ])->values()->all();
    }

    /** The template: the header + one line per product of the store (fill in the date and quantity). */
    public static function template(Store $store): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['date', 'product', 'quantity'], ',', '"', '\\');
        $example = now()->subMonthNoOverflow()->startOfMonth()->toDateString();
        foreach (Product::where('store_id', $store->id)->orderBy('name')->pluck('name') as $name) {
            fputcsv($out, [$example, $name, ''], ',', '"', '\\');
        }
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        return $csv;
    }
}
