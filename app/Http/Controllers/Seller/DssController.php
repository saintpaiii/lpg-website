<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DssController extends Controller
{
    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $now   = Carbon::today();

        // ── Reorder Alerts ────────────────────────────────────────────────────
        $reorderAlerts = Inventory::with('product')
            ->whereHas('product', fn ($q) => $q->where('store_id', $store->id)->where('is_active', true))
            ->get()
            ->filter(fn ($inv) => $inv->quantity <= $inv->reorder_level)
            ->map(function ($inv) use ($store, $now) {
                $product = $inv->product;

                // Average daily sales over the last 30 days (non-cancelled orders)
                $unitsSold = OrderItem::whereHas('order', fn ($q) =>
                    $q->where('store_id', $store->id)
                      ->whereNotIn('status', ['cancelled'])
                      ->where('created_at', '>=', $now->copy()->subDays(30))
                )->where('product_id', $product->id)->sum('quantity');

                $avgDailySales    = $unitsSold > 0 ? round($unitsSold / 30, 1) : null;
                $daysUntilStockout = $avgDailySales ? (int) floor($inv->quantity / $avgDailySales) : null;
                $recommendedOrder  = $avgDailySales ? (int) ceil($avgDailySales * 14) : null; // 2-week supply

                if ($inv->quantity === 0 || ($daysUntilStockout !== null && $daysUntilStockout <= 3)) {
                    $severity = 'critical';
                } elseif ($daysUntilStockout !== null && $daysUntilStockout <= 7) {
                    $severity = 'warning';
                } else {
                    $severity = 'notice';
                }

                $daysToOrder = match(true) {
                    $severity === 'critical'                                     => 'immediately',
                    $daysUntilStockout !== null && $daysUntilStockout <= 5      => "within {$daysUntilStockout} day(s)",
                    default                                                      => 'soon',
                };

                return [
                    'product_id'          => $product->id,
                    'name'                => $product->name,
                    'brand'               => $product->brand ?? '',
                    'current_stock'       => $inv->quantity,
                    'reorder_level'       => $inv->reorder_level,
                    'avg_daily_sales'     => $avgDailySales,
                    'days_until_stockout' => $daysUntilStockout,
                    'recommended_order'   => $recommendedOrder,
                    'days_to_order'       => $daysToOrder,
                    'severity'            => $severity,
                ];
            })
            ->sortBy(fn ($a) => match ($a['severity']) { 'critical' => 0, 'warning' => 1, default => 2 })
            ->values();

        // ── Sales Trend — last 30 days ────────────────────────────────────────
        $chartData = collect(range(29, 0))->map(function ($daysAgo) use ($store, $now) {
            $date        = $now->copy()->subDays($daysAgo);
            $revenue     = (float) $store->orders()->whereDate('created_at', $date)->where('payment_status', 'paid')->sum('total_amount');
            $ordersCount = (int) $store->orders()->whereDate('created_at', $date)->count();
            return ['date' => $date->format('Y-m-d'), 'label' => $date->format('M d'), 'revenue' => $revenue, 'orders_count' => $ordersCount, 'trend' => 0.0];
        })->values()->toArray();

        // OLS linear regression for trend line
        $n       = count($chartData);
        $xMean   = ($n - 1) / 2;
        $yMean   = collect($chartData)->avg('revenue');
        $num     = 0;
        $den     = 0;
        foreach ($chartData as $i => $pt) {
            $num += ($i - $xMean) * ($pt['revenue'] - $yMean);
            $den += ($i - $xMean) ** 2;
        }
        $slope     = $den > 0 ? $num / $den : 0;
        $intercept = $yMean - $slope * $xMean;
        foreach ($chartData as $i => &$pt) {
            $pt['trend'] = round(max(0, $intercept + $slope * $i), 2);
        }
        unset($pt);

        $thisWeek     = collect($chartData)->slice(-7)->sum('revenue');
        $lastWeek     = collect($chartData)->slice(-14, 7)->sum('revenue');
        $trendPct     = $lastWeek > 0 ? round((($thisWeek - $lastWeek) / $lastWeek) * 100, 1) : 0;
        $direction    = $trendPct > 5 ? 'increasing' : ($trendPct < -5 ? 'decreasing' : 'stable');
        $peakDayRaw   = collect($chartData)->sortByDesc('revenue')->first();
        $peakDay      = ($peakDayRaw && $peakDayRaw['revenue'] > 0) ? $peakDayRaw : null;

        $salesTrend = [
            'chart'         => $chartData,
            'direction'     => $direction,
            'trend_percent' => abs($trendPct),
            'this_week'     => round($thisWeek, 2),
            'last_week'     => round($lastWeek, 2),
            'peak_day'      => $peakDay,
            'slope'         => round($slope, 4),
        ];

        // ── Top Products (last 30 days) ───────────────────────────────────────
        $topProducts = OrderItem::whereHas('order', fn ($q) =>
            $q->where('store_id', $store->id)
              ->whereNotIn('status', ['cancelled'])
              ->where('created_at', '>=', $now->copy()->subDays(30))
        )->with('product')
         ->selectRaw('product_id, SUM(quantity) as units_sold, SUM(subtotal) as revenue')
         ->groupBy('product_id')
         ->orderByDesc('units_sold')
         ->take(5)
         ->get()
         ->map(fn ($item) => [
             'product_id' => $item->product_id,
             'name'       => $item->product?->name ?? '—',
             'brand'      => $item->product?->brand ?? '',
             'units_sold' => (int) $item->units_sold,
             'revenue'    => (float) $item->revenue,
         ])->values();

        // ── Demand Forecast — 7-day SMA ───────────────────────────────────────
        $dayColumns = collect(range(1, 7))->map(fn ($d) => [
            'key'   => 'D' . $d,
            'label' => $now->copy()->addDays($d)->format('M d'),
        ])->values()->toArray();

        $forecastProds = $topProducts->map(function ($tp) use ($store, $now, $dayColumns) {
            $dailyAvg = OrderItem::whereHas('order', fn ($q) =>
                $q->where('store_id', $store->id)
                  ->whereNotIn('status', ['cancelled'])
                  ->where('created_at', '>=', $now->copy()->subDays(30))
            )->where('product_id', $tp['product_id'])->sum('quantity') / 30;

            $forecast = [];
            foreach ($dayColumns as $col) {
                $forecast[$col['key']] = (int) round($dailyAvg);
            }
            return [
                'product_id' => $tp['product_id'],
                'name'       => $tp['name'],
                'brand'      => $tp['brand'],
                'forecast'   => $forecast,
                'total'      => array_sum($forecast),
            ];
        })->values()->toArray();

        $topNames  = array_column($forecastProds, 'name');
        $chartRows = array_map(function ($col, $idx) use ($forecastProds, $now) {
            $row = ['day' => $col['key'], 'date' => $now->copy()->addDays($idx + 1)->format('M d')];
            foreach ($forecastProds as $p) {
                $row[$p['name']] = $p['forecast'][$col['key']] ?? 0;
            }
            return $row;
        }, $dayColumns, array_keys($dayColumns));

        $demandForecast = [
            'products'    => $forecastProds,
            'chart'       => $chartRows,
            'top_names'   => $topNames,
            'day_columns' => $dayColumns,
        ];

        return Inertia::render('seller/dss', [
            'reorderAlerts'  => $reorderAlerts,
            'salesTrend'     => $salesTrend,
            'topProducts'    => $topProducts,
            'demandForecast' => $demandForecast,
            'generatedAt'    => now()->format('M d, Y g:i A'),
        ]);
    }
}
