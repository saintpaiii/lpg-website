<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\Store;
use App\Models\SupplierProduct;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * J8 — seasonal (month-of-year) demand forecast for the Seller DSS "Seasonal" tab. Advice only: auto-reorder (J7/K6)
 * and the admin DSS do not use it.
 *
 * Monthly demand = Σ quantity of NON-cancelled platform order items (orders.created_at) + Σ sales_history.quantity
 * (imported / demo past sales — different sales, so both are added). Complete months only, up to the last 36.
 *
 *  1. Seasonal index per calendar month (multiplicative):
 *       ≥ 24 months  ratio-to-moving-average — centered 12-month moving average (CMA), ratio_t = sales_t / CMA_t,
 *                    index_m = average ratio of calendar month m
 *       12–23 months ratio-to-mean — index_m = mean(sales in month m) / mean(all months)
 *       < 12 months  no seasonality (every index 1.00) — never invented
 *     The 12 indices are normalised to average exactly 1.00.
 *  2. Trend: deseasonalise (sales_t / index_m) and fit an OLS line level + slope × t (the mean when < 6 points).
 *  3. Forecast: F(month) = (level + slope × t) × index_month, never below 0. Daily rate = F / days in the month.
 *  4. Accuracy: hold out the last 3 complete months, fit on the rest, forecast them → MAPE (months with 0 actual
 *     skipped) and MAE. Good < 15%, Fair 15–30%, Weak > 30%. Only with ≥ 15 months.
 */
class SeasonalForecastService
{
    public const MONTHS = [1 => 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ── Pure functions ───────────────────────────────────────────────────────

    /**
     * Seasonal indices of a monthly series.
     *
     * @param  string[]  $yms     consecutive complete months "YYYY-MM", oldest first
     * @param  float[]   $values  sales per month (same order)
     * @return array{method: 'cma'|'mean'|'none', months: int, indices: array<int, float>}
     */
    public static function indices(array $yms, array $values, ?array $cfg = null): array
    {
        $cfg ??= config('forecast');
        $n = count($values);
        $flat = array_fill(1, 12, 1.0);
        if ($n < (int) $cfg['min_months']) {
            return ['method' => 'none', 'months' => $n, 'indices' => $flat];
        }
        $monthOf = fn (int $t) => (int) substr($yms[$t], 5, 2);
        $raw = [];

        if ($n >= (int) $cfg['cma_months']) {
            $ratios = [];
            for ($t = 6; $t <= $n - 7; $t++) {
                $sum = 0.5 * $values[$t - 6] + 0.5 * $values[$t + 6];
                for ($k = $t - 5; $k <= $t + 5; $k++) {
                    $sum += $values[$k];
                }
                $cma = $sum / 12;
                if ($cma > 0) {
                    $ratios[$monthOf($t)][] = $values[$t] / $cma;
                }
            }
            foreach (range(1, 12) as $m) {
                $raw[$m] = isset($ratios[$m]) ? array_sum($ratios[$m]) / count($ratios[$m]) : 1.0;
            }
            $method = 'cma';
        } else {
            $mean = array_sum($values) / $n;
            $byMonth = [];
            foreach ($values as $t => $v) {
                $byMonth[$monthOf($t)][] = $v;
            }
            foreach (range(1, 12) as $m) {
                $raw[$m] = $mean > 0 && isset($byMonth[$m]) ? (array_sum($byMonth[$m]) / count($byMonth[$m])) / $mean : 1.0;
            }
            $method = 'mean';
        }

        $avg = array_sum($raw) / 12;
        if ($avg <= 0) {
            return ['method' => $method, 'months' => $n, 'indices' => $flat];
        }

        return ['method' => $method, 'months' => $n, 'indices' => array_map(fn ($r) => round($r / $avg, 4), $raw)];
    }

    /**
     * OLS on the deseasonalised series (t = 0 … n−1). Fewer than trend_min_points → the mean, no slope.
     *
     * @return array{intercept: float, slope: float}
     */
    public static function trend(array $yms, array $values, array $indices, ?array $cfg = null): array
    {
        $cfg ??= config('forecast');
        $n = count($values);
        if ($n === 0) {
            return ['intercept' => 0.0, 'slope' => 0.0];
        }
        $d = [];
        foreach ($values as $t => $v) {
            $idx = $indices[(int) substr($yms[$t], 5, 2)] ?? 1.0;
            $d[$t] = $idx > 0 ? $v / $idx : $v;
        }
        $dbar = array_sum($d) / $n;
        if ($n < (int) $cfg['trend_min_points']) {
            return ['intercept' => $dbar, 'slope' => 0.0];
        }
        $tbar = ($n - 1) / 2;
        $num = $den = 0.0;
        foreach ($d as $t => $v) {
            $num += ($t - $tbar) * ($v - $dbar);
            $den += ($t - $tbar) ** 2;
        }
        $slope = $den > 0 ? $num / $den : 0.0;

        return ['intercept' => $dbar - $slope * $tbar, 'slope' => $slope];
    }

    /** Forecast for month index t (0 = the first month of the series): (level + slope × t) × index, never below 0. */
    public static function forecastAt(array $trend, int $t, float $index): float
    {
        return max(0.0, ($trend['intercept'] + $trend['slope'] * $t) * $index);
    }

    /** "YYYY-MM" + k months. */
    public static function addMonths(string $ym, int $k): string
    {
        return Carbon::createFromFormat('Y-m-d', "{$ym}-01")->addMonthsNoOverflow($k)->format('Y-m');
    }

    /**
     * The whole analysis of ONE series of complete months ending with the month before $today.
     *
     * @param  array<string, float|int>  $series  "YYYY-MM" => sales, consecutive, oldest first
     */
    public static function analyse(array $series, CarbonInterface $today, ?array $cfg = null, ?array $recent = null): array
    {
        $cfg ??= config('forecast');
        $yms = array_keys($series);
        $x = array_map('floatval', array_values($series));
        $n = count($x);
        $ind = static::indices($yms, $x, $cfg);
        $idx = $ind['indices'];
        $trend = static::trend($yms, $x, $idx, $cfg);
        $current = $today->format('Y-m');
        // t of the current month: right after the last complete month (the series always ends the month before)
        $tCur = $n;
        $daysIn = fn (string $ym) => Carbon::parse("{$ym}-01")->daysInMonth;
        // K7: no complete month yet (a new store / product) → a flat daily rate from the recent days instead of 0
        $rate = $n === 0 && $recent && ($recent['qty'] ?? 0) > 0 && ($recent['days'] ?? 0) > 0 ? $recent['qty'] / $recent['days'] : null;

        // Forecast: the current month (in full + the remaining days) and the next N calendar months
        $monthly = [];
        for ($k = 0; $k <= (int) $cfg['forecast_months']; $k++) {
            $ym = static::addMonths($current, $k);
            $m = (int) substr($ym, 5, 2);
            $f = $rate !== null ? $rate * $daysIn($ym) : static::forecastAt($trend, $tCur + $k, $idx[$m]);
            $normal = $rate !== null ? $f : max(0.0, $trend['intercept'] + $trend['slope'] * ($tCur + $k));
            $monthly[$ym] = ['ym' => $ym, 'label' => static::label($ym), 'month' => $m, 'qty' => (int) round($f), 'raw' => $f,
                'index' => $idx[$m], 'normal' => (int) round($normal)];
        }
        $sumDays = function (int $days) use ($today, $monthly, $daysIn) {
            $total = 0.0;
            for ($i = 0; $i < $days; $i++) {
                $ym = $today->copy()->addDays($i)->format('Y-m');
                $total += isset($monthly[$ym]) ? $monthly[$ym]['raw'] / $daysIn($ym) : 0.0;
            }

            return (int) round($total);
        };
        $remainingDays = $today->daysInMonth - $today->day + 1;
        $cur = $monthly[$current];

        // Backtest: fit on all but the last 3, forecast those 3
        $backtest = null;
        $hold = (int) $cfg['backtest_months'];
        if ($n >= (int) $cfg['backtest_min']) {
            $fitYms = array_slice($yms, 0, $n - $hold);
            $fitX = array_slice($x, 0, $n - $hold);
            $bi = static::indices($fitYms, $fitX, $cfg);
            $bt = static::trend($fitYms, $fitX, $bi['indices'], $cfg);
            $errs = $pct = [];
            $rows = [];
            for ($k = 0; $k < $hold; $k++) {
                $t = $n - $hold + $k;
                $f = static::forecastAt($bt, $t, $bi['indices'][(int) substr($yms[$t], 5, 2)]);
                $a = $x[$t];
                $errs[] = abs($a - $f);
                if ($a > 0) {
                    $pct[] = abs($a - $f) / $a * 100;
                }
                $rows[] = ['ym' => $yms[$t], 'label' => static::label($yms[$t]), 'actual' => (int) $a, 'forecast' => (int) round($f)];
            }
            $mape = $pct ? round(array_sum($pct) / count($pct), 1) : null;
            $backtest = [
                'mape' => $mape, 'mae' => round(array_sum($errs) / count($errs), 1), 'months' => $rows,
                'grade' => $mape === null ? null : ($mape < (float) $cfg['mape_good'] ? 'Good' : ($mape <= (float) $cfg['mape_fair'] ? 'Fair' : 'Weak')),
            ];
        }

        // Peak / low months (only with real seasonality)
        $peaks = $lows = [];
        if ($ind['method'] !== 'none') {
            $sorted = $idx;
            arsort($sorted);
            $peaks = array_values(array_filter(array_slice(array_keys($sorted), 0, 2, true), fn ($m) => $idx[$m] >= (float) $cfg['peak_index']));
            $low = array_key_last($sorted);
            $lows = $idx[$low] <= (float) $cfg['low_index'] ? [$low] : [];
        }

        // Chart: the last 24 months (actual + fitted), then the current month + the next months (forecast)
        $chart = [];
        foreach (array_slice($yms, -24, null, true) as $t => $ym) {
            $m = (int) substr($ym, 5, 2);
            $chart[] = ['ym' => $ym, 'label' => static::label($ym, true), 'actual' => (int) $x[$t],
                'fitted' => round(static::forecastAt($trend, $t, $idx[$m]), 1), 'forecast' => null, 'index' => $idx[$m]];
        }
        foreach ($monthly as $ym => $f) {
            $chart[] = ['ym' => $ym, 'label' => static::label($ym, true), 'actual' => null, 'fitted' => null, 'forecast' => $f['qty'], 'index' => $f['index']];
        }

        return [
            'method'       => $ind['method'],
            'months'       => $n,
            'enough'       => $ind['method'] !== 'none',
            'basis'        => $rate !== null ? 'recent' : 'months',
            'message'      => $rate !== null
                ? 'Based on your last ' . $recent['days'] . ' ' . ($recent['days'] === 1 ? 'day' : 'days') . ' (not enough history for seasonality).'
                : ($ind['method'] === 'none' ? "Not enough history for seasonality (need {$cfg['min_months']} months; you have {$n})." : null),
            'method_label' => match ($ind['method']) {
                'cma'  => "ratio-to-moving-average, {$n} months",
                'mean' => "ratio-to-mean, {$n} months",
                default => 'not enough history',
            },
            'indices'      => $idx,
            'peaks'        => $peaks,
            'lows'         => $lows,
            'trend'        => ['level' => round($trend['intercept'], 3), 'slope' => round($trend['slope'], 3)],
            'current'      => ['ym' => $current, 'label' => static::label($current), 'qty' => $cur['qty'], 'remaining_days' => $remainingDays,
                'remaining_qty' => (int) round($cur['raw'] * $remainingDays / $today->daysInMonth)],
            'forecast'     => array_values(array_map(fn ($f) => collect($f)->except('raw')->all(), array_slice($monthly, 1, null, true))),
            'next_30'      => $sumDays(30),
            'next_90'      => $sumDays(90),
            'backtest'     => $backtest,
            'chart'        => $chart,
            // Internal (advice): month → [forecast, normal]
            '_monthly'     => $monthly,
        ];
    }

    public static function label(string $ym, bool $short = false): string
    {
        return Carbon::parse("{$ym}-01")->format($short ? 'M Y' : 'F Y');
    }

    /** "+28%" / "−9%" vs an average month. */
    public static function pct(float $index): string
    {
        $p = (int) round(($index - 1) * 100);

        return ($p > 0 ? '+' : ($p < 0 ? '−' : '±')) . abs($p) . '%';
    }

    // ── Store data (SQL aggregation + cache) ─────────────────────────────────

    /** Everything the Seasonal tab shows, cached per store for 30 minutes (refreshed by a new order or an import). */
    public static function forStore(Store $store, ?CarbonInterface $today = null): array
    {
        $today = Carbon::parse(($today ?? now())->toDateString());
        $latestOrder = (int) DB::table('orders')->where('store_id', $store->id)->max('id');
        $history = SalesHistory::where('store_id', $store->id)->selectRaw('COUNT(*) AS n, MAX(id) AS last')->first();
        $key = "seasonal:{$store->id}:{$latestOrder}:{$history->n}:{$history->last}:{$today->toDateString()}";

        return Cache::remember($key, now()->addMinutes((int) config('forecast.cache_minutes', 30)), fn () => static::build($store, $today));
    }

    public static function build(Store $store, CarbonInterface $today): array
    {
        $cfg = config('forecast');
        $end = $today->copy()->startOfMonth();                                // exclusive: the current month is not complete
        $start = $end->copy()->subMonths((int) $cfg['max_months']);

        $products = Product::withTrashed()->where('store_id', $store->id)->get()->keyBy('id');
        $group = fn (?Product $p) => $p ? (SalesHistory::sizeGroupOf($p) ?? 'other') : 'other';

        // ONE query for platform orders, ONE for the sales history (GROUP BY product, year, month)
        $orderRows = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.store_id', $store->id)->where('orders.status', '!=', 'cancelled')
            ->whereNull('orders.deleted_at')->whereNull('order_items.deleted_at')
            ->where('orders.created_at', '>=', $start)->where('orders.created_at', '<', $end)
            ->groupBy('order_items.product_id', DB::raw('YEAR(orders.created_at)'), DB::raw('MONTH(orders.created_at)'))
            ->selectRaw('order_items.product_id AS pid, YEAR(orders.created_at) AS y, MONTH(orders.created_at) AS m, SUM(order_items.quantity) AS q, MIN(DATE(orders.created_at)) AS d')->get();
        $historyRows = DB::table('sales_history')->where('store_id', $store->id)
            ->where('sold_on', '>=', $start->toDateString())->where('sold_on', '<', $end->toDateString())
            ->groupBy('product_id', 'size_group', DB::raw('YEAR(sold_on)'), DB::raw('MONTH(sold_on)'))
            ->selectRaw('product_id AS pid, size_group AS g, YEAR(sold_on) AS y, MONTH(sold_on) AS m, SUM(quantity) AS q, MIN(sold_on) AS d')->get();

        // K7: the recent days of the CURRENT month (≤ 30) — the forecast of a series with no complete month yet
        $recentFrom = $today->copy()->subDays(29)->max($end);
        $recentTo = $today->copy()->addDay();
        $recentRows = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.store_id', $store->id)->where('orders.status', '!=', 'cancelled')
            ->whereNull('orders.deleted_at')->whereNull('order_items.deleted_at')
            ->where('orders.created_at', '>=', $recentFrom)->where('orders.created_at', '<', $recentTo)
            ->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id AS pid, NULL AS g, SUM(order_items.quantity) AS q, MIN(DATE(orders.created_at)) AS d')->get()
            ->concat(DB::table('sales_history')->where('store_id', $store->id)
                ->where('sold_on', '>=', $recentFrom->toDateString())->where('sold_on', '<', $recentTo->toDateString())
                ->groupBy('product_id', 'size_group')
                ->selectRaw('product_id AS pid, size_group AS g, SUM(quantity) AS q, MIN(sold_on) AS d')->get());

        $total = $groups = $byProduct = [];
        $first = $recent = [];   // series key → [ym → earliest date] / ['qty', 'first']
        $orderMonths = [];
        $keysOf = function (?int $pid, ?string $g) use ($products, $group) {
            $p = $pid ? $products->get($pid) : null;
            $g = $p ? $group($p) : ($g ?: 'other');

            return array_filter(['total', "group:{$g}", $pid ? "product:{$pid}" : null]);
        };
        $add = function (?int $pid, ?string $g, int $y, int $m, int $q, ?string $d) use (&$total, &$groups, &$byProduct, &$first, $products, $group, $keysOf) {
            $ym = sprintf('%04d-%02d', $y, $m);
            $total[$ym] = ($total[$ym] ?? 0) + $q;
            $p = $pid ? $products->get($pid) : null;
            $g = $p ? $group($p) : ($g ?: 'other');
            $groups[$g][$ym] = ($groups[$g][$ym] ?? 0) + $q;
            if ($pid) {
                $byProduct[$pid][$ym] = ($byProduct[$pid][$ym] ?? 0) + $q;
            }
            if ($d && $q > 0) {
                foreach ($keysOf($pid, $g) as $k) {
                    $first[$k][$ym] = isset($first[$k][$ym]) ? min($first[$k][$ym], $d) : $d;
                }
            }
        };
        foreach ($orderRows as $r) {
            $add($r->pid ? (int) $r->pid : null, null, (int) $r->y, (int) $r->m, (int) $r->q, $r->d ? substr((string) $r->d, 0, 10) : null);
            $orderMonths[sprintf('%04d-%02d', $r->y, $r->m)] = true;
        }
        foreach ($historyRows as $r) {
            $add($r->pid ? (int) $r->pid : null, $r->g, (int) $r->y, (int) $r->m, (int) $r->q, $r->d ? substr((string) $r->d, 0, 10) : null);
        }
        foreach ($recentRows as $r) {
            if ((int) $r->q <= 0) {
                continue;
            }
            $d = substr((string) $r->d, 0, 10);
            foreach ($keysOf($r->pid ? (int) $r->pid : null, $r->g) as $k) {
                $recent[$k]['qty'] = ($recent[$k]['qty'] ?? 0) + (int) $r->q;
                $recent[$k]['first'] = isset($recent[$k]['first']) ? min($recent[$k]['first'], $d) : $d;
            }
        }

        // complete months → partial first month dropped / scaled → analysis (with the recent-days fallback)
        $windowStart = $start->format('Y-m');
        $run = function (string $key, array $byMonth) use ($end, $today, $cfg, $first, $recent, $windowStart) {
            $s = static::complete($byMonth, $end);
            $firstYm = array_key_first($s);
            // The window's first month may hold older sales outside the window → never treated as a partial start
            if ($firstYm !== null && $firstYm !== $windowStart) {
                $s = static::partialFirst($s, $first[$key][$firstYm] ?? null, (int) $cfg['min_months']);
            }
            $r = isset($recent[$key]) ? ['qty' => $recent[$key]['qty'],
                'days' => min(30, (int) Carbon::parse($recent[$key]['first'])->diffInDays($today) + 1)] : null;

            return static::analyse($s, $today, $cfg, $r);
        };

        // Same 30 / 90 days last year (for "vs last year" on the forecast cards): 2 queries
        $ly = static::lastYearWindows($store->id, $today);

        $series = [];
        $series['total'] = ['key' => 'total', 'kind' => 'total', 'label' => 'All products (store total)', 'unit' => 'units']
            + $run('total', $total) + ['last_year' => $ly['total']];
        $groupKeys = collect(array_keys($groups + array_flip(array_map(fn ($k) => substr($k, 6), array_filter(array_keys($recent), fn ($k) => str_starts_with($k, 'group:'))))))
            ->sortBy(fn ($g) => $g === 'accessory' ? 9999 : ($g === 'other' ? 9998 : (float) $g))->values();
        foreach ($groupKeys as $g) {
            $series["group:{$g}"] = ['key' => "group:{$g}", 'kind' => 'group', 'label' => $g === 'accessory' ? 'Accessories (all)' : ($g === 'other' ? 'Other products' : "All {$g} tanks"),
                'unit' => $g === 'accessory' ? 'units' : 'tanks'] + $run("group:{$g}", $groups[$g] ?? [])
                + ['last_year' => $ly['groups'][$g] ?? ['d30' => 0, 'd90' => 0, 'known' => $ly['known']]];
        }
        foreach ($products->filter(fn ($p) => ! $p->trashed() && $p->is_active)->sortBy('name') as $p) {
            $series["product:{$p->id}"] = ['key' => "product:{$p->id}", 'kind' => 'product', 'label' => $p->name, 'product_id' => $p->id,
                'unit' => $p->isAccessory() ? 'units' : 'tanks'] + $run("product:{$p->id}", $byProduct[$p->id] ?? [])
                + ['last_year' => $ly['products'][$p->id] ?? ['d30' => 0, 'd90' => 0, 'known' => $ly['known']]];
        }

        $advice = static::advice($series, $products, $today, $cfg);
        foreach ($series as &$s) {
            unset($s['_monthly']);
        }
        unset($s);

        return [
            'series'       => array_values($series),
            'advice'       => $advice,
            'has_demo'     => SalesHistory::where('store_id', $store->id)->where('source', 'demo')->exists(),
            'has_history'  => SalesHistory::where('store_id', $store->id)->exists(),
            'order_months' => array_keys($orderMonths),
            'generated_at' => now()->format('M j, Y g:i A'),
        ];
    }

    /**
     * The months from the first one with sales up to the last complete month, zeros filled in (oldest first).
     * Sales from before a gap of ≥ gap_months months with NO sales are dropped (e.g. one stray old imported row would
     * otherwise add a run of empty months and distort the pattern); a gap at the very end (sales stopped) is kept.
     */
    public static function complete(array $byMonth, CarbonInterface $end, ?int $gap = null): array
    {
        $gap ??= (int) config('forecast.gap_months', 3);
        $nonZero = array_keys(array_filter($byMonth, fn ($q) => $q > 0));
        if (! $nonZero) {
            return [];
        }
        sort($nonZero);
        $out = [];
        for ($ym = $nonZero[0], $last = $end->copy()->subMonth()->format('Y-m'); $ym <= $last; $ym = static::addMonths($ym, 1)) {
            $out[$ym] = (int) ($byMonth[$ym] ?? 0);
        }
        $start = 0;
        $run = 0;
        foreach (array_values($out) as $i => $q) {
            if ($q > 0) {
                if ($run >= $gap) {
                    $start = $i;   // sales resume after a long gap → start here
                }
                $run = 0;
            } else {
                $run++;
            }
        }

        return array_slice($out, $start, null, true);
    }

    /**
     * K7: a series whose earliest sale is after the 1st of its first month (a store / product that started mid-month,
     * or demo history starting on e.g. Nov 19) → that month is partial. Drop it, unless that leaves fewer than
     * $min complete months — then scale it to a full-month estimate (total × days in month ÷ days covered).
     *
     * @param  array<string, int>  $series  complete() output
     */
    public static function partialFirst(array $series, ?string $firstDate, int $min = 12): array
    {
        $ym = array_key_first($series);
        if ($ym === null || ! $firstDate) {
            return $series;
        }
        $d = Carbon::parse($firstDate);
        if ($d->format('Y-m') !== $ym || $d->day === 1) {
            return $series;
        }
        if (count($series) - 1 >= $min) {
            return array_slice($series, 1, null, true);
        }
        $covered = $d->daysInMonth - $d->day + 1;
        $series[$ym] = (int) round($series[$ym] * $d->daysInMonth / $covered);

        return $series;
    }

    /**
     * K7: how much to order for a peak month. The store keeps selling until the peak starts, so:
     *   sold_before = forecast demand from today (its remaining part included) to the day before the peak month
     *                 (each month's forecast ÷ its days)
     *   projected   = usable + on order − sold_before
     *   order       = max(0, ceil(peak forecast − max(projected, 0)))
     *
     * @param  array<string, array{raw: float}>  $monthly  analyse()['_monthly']
     * @return array{sold_before: int, projected: int, order: int}
     */
    public static function peakOrder(int $usable, int $onOrder, array $monthly, string $peakYm, CarbonInterface $today): array
    {
        $peakStart = Carbon::parse("{$peakYm}-01");
        $sold = 0.0;
        for ($d = Carbon::parse($today->toDateString()); $d->lt($peakStart); $d = $d->copy()->addDay()) {
            $ym = $d->format('Y-m');
            $sold += isset($monthly[$ym]) ? $monthly[$ym]['raw'] / $d->daysInMonth : 0.0;
        }
        $projected = $usable + $onOrder - $sold;
        $peak = (float) ($monthly[$peakYm]['raw'] ?? 0);

        return ['sold_before' => (int) round($sold), 'projected' => (int) round($projected),
            'order' => (int) max(0, ceil(round($peak - max($projected, 0.0), 6)))];
    }

    /** Units sold in the same 30 / 90 days one year ago (orders + history), per product, size group and store. */
    private static function lastYearWindows(int $storeId, CarbonInterface $today): array
    {
        $from = $today->copy()->subYear();
        $d30 = $from->copy()->addDays(30);
        $d90 = $from->copy()->addDays(90);
        $orders = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.store_id', $storeId)->where('orders.status', '!=', 'cancelled')->whereNull('orders.deleted_at')->whereNull('order_items.deleted_at')
            ->where('orders.created_at', '>=', $from)->where('orders.created_at', '<', $d90)->groupBy('order_items.product_id')
            ->selectRaw('order_items.product_id AS pid, NULL AS g, SUM(CASE WHEN orders.created_at < ? THEN order_items.quantity ELSE 0 END) AS q30, SUM(order_items.quantity) AS q90', [$d30])->get();
        $hist = DB::table('sales_history')->where('store_id', $storeId)->where('sold_on', '>=', $from->toDateString())->where('sold_on', '<', $d90->toDateString())
            ->groupBy('product_id', 'size_group')
            ->selectRaw('product_id AS pid, size_group AS g, SUM(CASE WHEN sold_on < ? THEN quantity ELSE 0 END) AS q30, SUM(quantity) AS q90', [$d30->toDateString()])->get();
        // "Known" = the store has any sales that old (otherwise "vs last year" is not shown)
        $earliest = min(array_filter([
            DB::table('orders')->where('store_id', $storeId)->where('status', '!=', 'cancelled')->min('created_at'),
            DB::table('sales_history')->where('store_id', $storeId)->min('sold_on'),
        ]) ?: [null]);
        $known = $earliest !== null && Carbon::parse($earliest)->lte($from);

        $products = Product::withTrashed()->where('store_id', $storeId)->get()->keyBy('id');
        $blank = ['d30' => 0, 'd90' => 0, 'known' => $known];
        $out = ['total' => $blank, 'groups' => [], 'products' => [], 'known' => $known];
        foreach ($orders->concat($hist) as $r) {
            $p = $r->pid ? $products->get((int) $r->pid) : null;
            $g = $p ? (SalesHistory::sizeGroupOf($p) ?? 'other') : ($r->g ?: 'other');
            $out['groups'][$g] ??= $blank;
            $targets = [['total'], ['groups', $g]];
            if ($p) {
                $out['products'][$p->id] ??= $blank;
                $targets[] = ['products', $p->id];
            }
            foreach ($targets as $path) {
                $ref = &$out;
                foreach ($path as $k) {
                    $ref = &$ref[$k];
                }
                $ref['d30'] += (int) $r->q30;
                $ref['d90'] += (int) $r->q90;
                unset($ref);
            }
        }

        return $out;
    }

    // ── Advice (rule-based) ──────────────────────────────────────────────────

    /**
     * A peak month starting within 45 days → how much to order and by when (usable stock, open POs, the preferred
     * supplier's lead time). A low month → avoid overstocking. Not enough history → import past sales.
     */
    public static function advice(array $series, $products, CarbonInterface $today, array $cfg): array
    {
        $out = [];
        if (! $series['total']['enough']) {
            $out[] = ['type' => 'history', 'text' => 'Import your past sales (CSV) to see seasonal patterns.'];
        }
        $window = $today->copy()->addDays((int) $cfg['advice_window_days']);
        $productSeries = array_filter($series, fn ($s) => $s['kind'] === 'product' && $s['enough']);
        $ids = array_map(fn ($s) => $s['product_id'], $productSeries);
        $usable = StockService::usableMap($ids);
        $lead = SupplierProduct::with('supplier:id,lead_time_days,is_active')->whereIn('product_id', $ids)->where('is_preferred', true)->get()
            ->filter(fn ($l) => $l->supplier?->is_active)->mapWithKeys(fn ($l) => [$l->product_id => (int) $l->supplier->lead_time_days]);

        foreach ($productSeries as $s) {
            $pid = $s['product_id'];
            $unit = $s['unit'];
            foreach ($s['_monthly'] as $ym => $f) {
                $startOn = Carbon::parse("{$ym}-01");
                if ($startOn->lte($today) || $startOn->gt($window)) {
                    continue;   // only months that START within the window
                }
                $month = static::MONTHS[$f['month']];
                if (in_array($f['month'], $s['peaks'], true)) {
                    $have = $usable[$pid] ?? 0;
                    $onOrder = ReorderService::onOrder($pid);
                    $days = $lead[$pid] ?? (int) $cfg['default_lead_days'];
                    $calc = static::peakOrder($have, $onOrder, $s['_monthly'], $ym, $today);
                    $need = $calc['order'];
                    $by = $startOn->copy()->subDays($days);
                    $stock = "You have {$have} usable" . ($onOrder ? " + {$onOrder} on order" : '')
                        . "; about {$calc['sold_before']} will sell before {$month}";
                    $text = "{$month} is usually " . static::pct($f['index']) . " for {$s['label']}. Expect about {$f['qty']} {$unit} (vs {$f['normal']} a normal month). "
                        . ($need > 0
                            ? "{$stock}, so order about {$need} " . ($by->lte($today) ? 'now' : 'by ' . $by->format('M j'))
                                . " to cover {$month} ({$f['qty']}) — {$days}-day supplier lead time."
                            : "{$stock}, leaving about " . max(0, $calc['projected']) . " — enough for the expected demand.");
                    $out[] = ['type' => 'peak', 'product_id' => $pid, 'month' => $f['month'], 'order_qty' => $need, 'order_by' => $need > 0 ? $by->toDateString() : null,
                        'sold_before' => $calc['sold_before'], 'projected' => $calc['projected'], 'text' => $text];
                } elseif (in_array($f['month'], $s['lows'], true)) {
                    $out[] = ['type' => 'low', 'product_id' => $pid, 'month' => $f['month'],
                        'text' => "{$month} is usually " . static::pct($f['index']) . " for {$s['label']} — avoid overstocking."];
                }
            }
        }

        return $out;
    }
}
