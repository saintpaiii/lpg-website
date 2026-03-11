<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DssLog;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DssController extends Controller
{
    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $reorderAlerts    = $this->computeReorderAlerts();
        $demandForecast   = $this->computeDemandForecast();
        $salesTrend       = $this->computeSalesTrend();
        $businessInsights = $this->computeBusinessInsights();

        // Log this DSS run
        DssLog::create([
            'type' => 'dashboard_run',
            'data' => [
                'alerts_critical'  => count(array_filter($reorderAlerts, fn ($a) => $a['severity'] === 'critical')),
                'alerts_warning'   => count(array_filter($reorderAlerts, fn ($a) => $a['severity'] === 'warning')),
                'trend_direction'  => $salesTrend['direction'],
                'trend_percent'    => $salesTrend['trend_percent'],
                'forecast_products'=> count($demandForecast['products']),
            ],
        ]);

        return Inertia::render('admin/dss', [
            'reorderAlerts'    => $reorderAlerts,
            'demandForecast'   => $demandForecast,
            'salesTrend'       => $salesTrend,
            'businessInsights' => $businessInsights,
            'generatedAt'      => now()->format('M d, Y g:i A'),
        ]);
    }

    // ── Section 1: Reorder Alerts ─────────────────────────────────────────────
    // Formula: days_until_stockout = current_stock ÷ avg_daily_sales_last_30_days

    private function computeReorderAlerts(): array
    {
        $thirtyDaysAgo = now()->subDays(30);

        // Total units sold per product in last 30 days (non-cancelled, non-deleted)
        $productSales = OrderItem::select(
                'order_items.product_id',
                DB::raw('SUM(order_items.quantity) as total_units')
            )
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->where('orders.created_at', '>=', $thirtyDaysAgo)
            ->groupBy('order_items.product_id')
            ->get()
            ->keyBy('product_id');

        $inventories = Inventory::whereNull('deleted_at')
            ->with(['product' => fn ($q) => $q->whereNull('deleted_at')->where('is_active', true)])
            ->get()
            ->filter(fn ($inv) => $inv->product !== null);

        $alerts = [];

        foreach ($inventories as $inv) {
            $salesRecord = $productSales->get($inv->product_id);
            $totalUnits  = $salesRecord ? (float) $salesRecord->total_units : 0;
            $avgDaily    = round($totalUnits / 30, 4);

            $hasData = $avgDaily > 0;

            if ($hasData) {
                $daysUntilStockout = $avgDaily > 0 ? floor($inv->quantity / $avgDaily) : PHP_INT_MAX;
                $shouldAlert       = $daysUntilStockout <= 14 || $inv->quantity <= $inv->reorder_level;
            } else {
                $daysUntilStockout = null;
                $shouldAlert       = $inv->quantity <= $inv->reorder_level;
            }

            if (! $shouldAlert) {
                continue;
            }

            $severity = match (true) {
                $hasData && $daysUntilStockout < 3  => 'critical',
                $hasData && $daysUntilStockout < 7  => 'warning',
                ! $hasData && $inv->quantity <= $inv->reorder_level => 'notice',
                default                              => 'notice',
            };

            // Recommended order = 30-day supply to fill stock
            $recommendedOrder = $hasData ? (int) ceil($avgDaily * 30) : null;

            $daysToOrder = match ($severity) {
                'critical' => 'immediately',
                'warning'  => 'within ' . max(1, (int) $daysUntilStockout - 2) . ' days',
                default    => 'within 7 days',
            };

            $alerts[] = [
                'product_id'          => $inv->product_id,
                'name'                => $inv->product->name,
                'brand'               => $inv->product->brand ?? '',
                'current_stock'       => (int) $inv->quantity,
                'reorder_level'       => (int) $inv->reorder_level,
                'avg_daily_sales'     => $hasData ? round($avgDaily, 2) : null,
                'days_until_stockout' => $hasData ? (int) $daysUntilStockout : null,
                'recommended_order'   => $recommendedOrder,
                'days_to_order'       => $daysToOrder,
                'severity'            => $severity,
            ];
        }

        // Sort: critical first, then warning, then notice; within same severity by urgency
        $order = ['critical' => 0, 'warning' => 1, 'notice' => 2];
        usort($alerts, function ($a, $b) use ($order) {
            $cmp = $order[$a['severity']] <=> $order[$b['severity']];
            if ($cmp !== 0) {
                return $cmp;
            }
            $aD = $a['days_until_stockout'] ?? PHP_INT_MAX;
            $bD = $b['days_until_stockout'] ?? PHP_INT_MAX;
            return $aD <=> $bD;
        });

        return $alerts;
    }

    // ── Section 2: Demand Forecast ────────────────────────────────────────────
    // Method: Simple Moving Average — avg of last 4 same-weekday sales per product

    private function computeDemandForecast(): array
    {
        $dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        $products = Product::whereNull('deleted_at')
            ->where('is_active', true)
            ->get();

        // Daily units sold per product over last 28 days
        $dailySales = OrderItem::select(
                'order_items.product_id',
                DB::raw('DATE(orders.created_at) as sale_date'),
                DB::raw('SUM(order_items.quantity) as units')
            )
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->where('orders.created_at', '>=', now()->subDays(28))
            ->groupBy('order_items.product_id', 'sale_date')
            ->get()
            ->groupBy('product_id');

        // Next 7 days meta
        $nextSevenDays = collect(range(1, 7))->map(fn ($i) => now()->addDays($i));

        $productForecasts = [];

        foreach ($products as $product) {
            $productDailySales = $dailySales->get($product->id, collect());
            $forecast          = [];
            $total             = 0;

            foreach ($nextSevenDays as $day) {
                $dow = (int) $day->format('w');

                // Average sales for this weekday over last 4 occurrences
                $sameWeekday = $productDailySales->filter(
                    fn ($row) => (int) Carbon::parse($row->sale_date)->format('w') === $dow
                );

                if ($sameWeekday->count() > 0) {
                    $predicted = (int) round($sameWeekday->avg('units'));
                } else {
                    // Fallback: overall daily average
                    $overall   = $productDailySales->avg('units') ?? 0;
                    $predicted = (int) round($overall);
                }

                $key           = $dayNames[$dow];
                $forecast[$key] = max(0, $predicted);
                $total         += $forecast[$key];
            }

            if ($total > 0) {
                $productForecasts[] = [
                    'product_id' => $product->id,
                    'name'       => $product->name,
                    'brand'      => $product->brand ?? '',
                    'forecast'   => $forecast,
                    'total'      => $total,
                ];
            }
        }

        usort($productForecasts, fn ($a, $b) => $b['total'] <=> $a['total']);

        // Top 5 for chart visibility
        $topProducts = array_slice($productForecasts, 0, 5);
        $topNames    = array_column($topProducts, 'name');

        // Build chart rows: one row per day
        $chartData = $nextSevenDays->map(function ($day) use ($topProducts, $dayNames) {
            $dow   = (int) $day->format('w');
            $key   = $dayNames[$dow];
            $entry = ['day' => $key, 'date' => $day->format('M j')];
            foreach ($topProducts as $p) {
                $entry[$p['name']] = $p['forecast'][$key] ?? 0;
            }
            return $entry;
        })->values()->toArray();

        // Column headers for the table (Mon–Sun order for next 7 days)
        $dayColumns = $nextSevenDays->map(fn ($d) => [
            'key'   => $dayNames[(int) $d->format('w')],
            'label' => $dayNames[(int) $d->format('w')] . ' ' . $d->format('j'),
        ])->values()->toArray();

        DssLog::create([
            'type' => 'demand_forecast',
            'data' => [
                'method'           => 'Simple Moving Average (same-weekday, 4-week window)',
                'products_count'   => count($productForecasts),
                'forecast_horizon' => '7 days',
                'top_product'      => $productForecasts[0]['name'] ?? null,
                'top_weekly_units' => $productForecasts[0]['total'] ?? 0,
            ],
        ]);

        return [
            'products'    => $productForecasts,
            'chart'       => $chartData,
            'top_names'   => $topNames,
            'day_columns' => $dayColumns,
        ];
    }

    // ── Section 3: Sales Trend ────────────────────────────────────────────────
    // Method: Linear Regression on last 30 days + Week-over-Week comparison

    private function computeSalesTrend(): array
    {
        // Fill every day in last 30 with actual revenue (0 if no orders)
        $dbRows = Order::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('SUM(total_amount) as revenue'),
                DB::raw('COUNT(*) as orders_count')
            )
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->where('created_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $filledData = [];
        for ($i = 29; $i >= 0; $i--) {
            $date  = now()->subDays($i)->toDateString();
            $found = $dbRows->get($date);
            $filledData[] = [
                'date'         => $date,
                'label'        => now()->subDays($i)->format('M j'),
                'revenue'      => $found ? (float) $found->revenue : 0.0,
                'orders_count' => $found ? (int)   $found->orders_count : 0,
            ];
        }

        // Linear regression: y = intercept + slope * x
        $n = count($filledData);
        $sumX = $sumY = $sumXY = $sumX2 = 0.0;

        foreach ($filledData as $i => $row) {
            $sumX  += $i;
            $sumY  += $row['revenue'];
            $sumXY += $i * $row['revenue'];
            $sumX2 += $i * $i;
        }

        $denom = ($n * $sumX2 - $sumX * $sumX);
        if ($denom != 0) {
            $slope     = ($n * $sumXY - $sumX * $sumY) / $denom;
            $intercept = ($sumY - $slope * $sumX) / $n;
        } else {
            $slope     = 0;
            $intercept = $n > 0 ? $sumY / $n : 0;
        }

        // Add trend line values to each point
        foreach ($filledData as $i => &$row) {
            $row['trend'] = round(max(0.0, $intercept + $slope * $i), 2);
        }
        unset($row);

        // Week-over-week comparison
        $thisWeek = collect($filledData)->slice(-7)->sum('revenue');
        $lastWeek = collect($filledData)->slice(-14, 7)->sum('revenue');

        $trendPercent = 0.0;
        if ($lastWeek > 0) {
            $trendPercent = round((($thisWeek - $lastWeek) / $lastWeek) * 100, 1);
        }

        $direction = match (true) {
            $trendPercent >  5 => 'increasing',
            $trendPercent < -5 => 'decreasing',
            default            => 'stable',
        };

        // Highest revenue day in last 30
        $peakDay = collect($filledData)->sortByDesc('revenue')->first();

        DssLog::create([
            'type' => 'trend_analysis',
            'data' => [
                'method'       => 'Linear Regression (OLS) + Week-over-Week',
                'direction'    => $direction,
                'trend_pct'    => $trendPercent,
                'slope'        => round($slope, 4),
                'intercept'    => round($intercept, 4),
                'this_week'    => round($thisWeek, 2),
                'last_week'    => round($lastWeek, 2),
                'peak_day'     => $peakDay['date'] ?? null,
                'peak_revenue' => $peakDay['revenue'] ?? 0,
            ],
        ]);

        return [
            'chart'         => $filledData,
            'direction'     => $direction,
            'trend_percent' => $trendPercent,
            'this_week'     => round($thisWeek, 2),
            'last_week'     => round($lastWeek, 2),
            'peak_day'      => $peakDay,
            'slope'         => round($slope, 4),
        ];
    }

    // ── Section 4: Business Insights ──────────────────────────────────────────

    private function computeBusinessInsights(): array
    {
        $now = now();

        // Peak day of week (last 90 days, by order count)
        $peakDayRow = Order::select(
                DB::raw('DAYOFWEEK(created_at) as dow'),
                DB::raw('COUNT(*) as total_orders')
            )
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->where('created_at', '>=', $now->copy()->subDays(90))
            ->groupBy('dow')
            ->orderByDesc('total_orders')
            ->first();

        $dowNames  = [1 => 'Sunday', 2 => 'Monday', 3 => 'Tuesday', 4 => 'Wednesday', 5 => 'Thursday', 6 => 'Friday', 7 => 'Saturday'];
        $peakDay   = $peakDayRow ? ($dowNames[$peakDayRow->dow] ?? 'Unknown') : null;
        // Approximate average: total over 13 weeks (~90 days / 7)
        $peakAvg   = $peakDayRow ? round($peakDayRow->total_orders / 13, 1) : 0;

        // Most active customer this month
        $topCustomer = Order::select(
                'customer_id',
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as total_spent')
            )
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereYear('created_at', $now->year)
            ->whereMonth('created_at', $now->month)
            ->groupBy('customer_id')
            ->orderByDesc('orders_count')
            ->with('customer')
            ->first();

        // Best-selling product this month
        $bestSeller = OrderItem::select(
                'order_items.product_id',
                DB::raw('SUM(order_items.quantity) as units_sold')
            )
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->whereYear('orders.created_at', $now->year)
            ->whereMonth('orders.created_at', $now->month)
            ->groupBy('order_items.product_id')
            ->orderByDesc('units_sold')
            ->with('product')
            ->first();

        // Revenue projection: linear extrapolation from last 3 full months
        $recentMonths = Order::select(
                DB::raw('YEAR(created_at)  as yr'),
                DB::raw('MONTH(created_at) as mo'),
                DB::raw('SUM(total_amount) as revenue')
            )
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->where('created_at', '>=', $now->copy()->subMonths(3)->startOfMonth())
            ->where('created_at', '<',  $now->copy()->startOfMonth())
            ->groupBy('yr', 'mo')
            ->orderBy('yr')->orderBy('mo')
            ->get();

        $projectedRevenue = null;
        if ($recentMonths->count() >= 2) {
            $revenues = $recentMonths->pluck('revenue')->map(fn ($v) => (float) $v)->toArray();
            $last     = end($revenues);
            $prev     = prev($revenues);
            $growth   = $prev > 0 ? (($last - $prev) / $prev) : 0;
            $projectedRevenue = round($last * (1 + $growth), 2);
        } elseif ($recentMonths->count() === 1) {
            $projectedRevenue = (float) $recentMonths->first()->revenue;
        }

        // This month's revenue so far
        $thisMonthRevenue = Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereYear('created_at', $now->year)
            ->whereMonth('created_at', $now->month)
            ->sum('total_amount');

        // Total orders this month
        $thisMonthOrders = Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereYear('created_at', $now->year)
            ->whereMonth('created_at', $now->month)
            ->count();

        DssLog::create([
            'type' => 'business_insights',
            'data' => [
                'peak_day'          => $peakDay,
                'peak_avg'          => $peakAvg,
                'top_customer'      => $topCustomer?->customer?->name,
                'best_seller'       => $bestSeller?->product?->name,
                'projected_revenue' => $projectedRevenue,
                'month_revenue'     => (float) $thisMonthRevenue,
                'month_orders'      => $thisMonthOrders,
            ],
        ]);

        return [
            'peak_day'           => $peakDay,
            'peak_avg_orders'    => $peakAvg,
            'top_customer'       => $topCustomer ? [
                'name'         => $topCustomer->customer?->name ?? 'Unknown',
                'orders_count' => (int) $topCustomer->orders_count,
                'total_spent'  => (float) $topCustomer->total_spent,
            ] : null,
            'best_seller' => $bestSeller ? [
                'name'       => $bestSeller->product?->name ?? 'Unknown',
                'units_sold' => (int) $bestSeller->units_sold,
            ] : null,
            'revenue_projection' => $projectedRevenue,
            'this_month_revenue' => (float) $thisMonthRevenue,
            'this_month_orders'  => $thisMonthOrders,
        ];
    }
}
