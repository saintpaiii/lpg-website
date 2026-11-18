<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\Store;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * J8 — DEMO sales history so demo stores show a meaningful seasonal chart. It writes ONLY to sales_history
 * (source 'demo'): never orders, invoices, receipts, revenue, commissions or reports.
 *
 * Per active product and day:
 *   base (recent real demand: last 30 days of orders ÷ 30 when that's at least 30 units, else a default by size —
 *         config forecast.demo_base_per_day)
 *   × month factor (config forecast.demo_month_factors — DEMO ASSUMPTIONS, not facts)
 *   × yearly growth (+5%/year, so the latest days are ≈ the base)
 *   × noise (±20%, seeded by store + product → repeatable)
 * rounded randomly (2.6 → 3 with 60% chance, else 2) so small rates like 0.3/day don't all round to 0; never negative.
 *
 * The history runs up to yesterday. Days with real platform orders are added on top (the forecast adds both), which
 * for a demo store's few seeded orders is a small bump.
 */
class SalesHistoryDemoService
{
    public static function generate(Store $store, int $years = 2, ?Carbon $today = null): int
    {
        $cfg = config('forecast');
        $today = ($today ?? now())->copy()->startOfDay();
        $start = $today->copy()->subYears(max(1, $years));
        $end = $today->copy()->subDay();

        $products = Product::where('store_id', $store->id)->where('is_active', true)->orderBy('id')->get();
        $recent = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.store_id', $store->id)->where('orders.status', '!=', 'cancelled')->whereNull('orders.deleted_at')->whereNull('order_items.deleted_at')
            ->where('orders.created_at', '>=', $today->copy()->subDays(30))
            ->groupBy('order_items.product_id')->selectRaw('order_items.product_id AS pid, SUM(order_items.quantity) AS q')->pluck('q', 'pid');

        $rows = [];
        $now = now();
        foreach ($products as $p) {
            $group = SalesHistory::sizeGroupOf($p);
            // Recent real demand when there's enough of it (≥ 1 a day on average); a few scattered demo orders would
            // give a near-zero base and a meaningless chart, so then the size default is used
            $base = isset($recent[$p->id]) && $recent[$p->id] >= 30
                ? (float) $recent[$p->id] / 30
                : (float) ($cfg['demo_base_per_day'][$group ?? 'other'] ?? $cfg['demo_base_per_day']['other']);
            mt_srand(crc32("sales-history-demo:{$store->id}:{$p->id}"));
            for ($d = $start->copy(); $d->lte($end); $d = $d->addDay()) {   // reassign: now() is CarbonImmutable here
                $yearsBack = $d->diffInDays($end) / 365;
                $q = $base * (float) $cfg['demo_month_factors'][$d->month] * (1 + (float) $cfg['demo_growth_per_year']) ** (-$yearsBack)
                    * (1 + (float) $cfg['demo_noise'] * (2 * mt_rand() / mt_getrandmax() - 1));
                $q = max(0.0, $q);
                $qty = (int) floor($q) + (mt_rand() / mt_getrandmax() < $q - floor($q) ? 1 : 0);
                if ($qty > 0) {
                    $rows[] = ['store_id' => $store->id, 'product_id' => $p->id, 'product_label' => $p->name, 'size_group' => $group,
                        'sold_on' => $d->toDateString(), 'quantity' => $qty, 'source' => 'demo', 'import_batch' => null, 'created_by' => null,
                        'created_at' => $now, 'updated_at' => $now];
                }
            }
        }
        mt_srand();   // back to a random seed for everything else

        DB::transaction(function () use ($store, $rows) {
            static::remove($store);
            foreach (array_chunk($rows, 1000) as $chunk) {
                SalesHistory::insert($chunk);
            }
        });

        return count($rows);
    }

    public static function remove(Store $store): int
    {
        return SalesHistory::where('store_id', $store->id)->where('source', 'demo')->delete();
    }
}
