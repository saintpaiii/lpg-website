<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DssLog;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Store;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DssController extends Controller
{
    public function index(): Response
    {
        $salesTrend       = $this->computeSalesTrend();
        $topStores        = $this->computeTopStores();
        $customerGrowth   = $this->computeCustomerGrowth();
        $topProducts      = $this->computeTopProducts();
        $businessInsights = $this->computeBusinessInsights();
        $platformInsights = $this->computePlatformInsights();

        DssLog::create([
            'type' => 'admin_dashboard_run',
            'data' => [
                'trend_direction'   => $salesTrend['direction'],
                'trend_percent'     => $salesTrend['trend_percent'],
                'top_store'         => $topStores[0]['store_name'] ?? null,
                'top_product'       => $topProducts[0]['name'] ?? null,
                'new_customers_wk'  => end($customerGrowth)['new_customers'] ?? 0,
            ],
        ]);

        return Inertia::render('admin/dss', [
            'salesTrend'       => $salesTrend,
            'topStores'        => $topStores,
            'customerGrowth'   => $customerGrowth,
            'topProducts'      => $topProducts,
            'businessInsights' => $businessInsights,
            'platformInsights' => $platformInsights,
            'generatedAt'      => now()->format('M d, Y g:i A'),
        ]);
    }

    // ── Section 1: Platform Revenue Trend ─────────────────────────────────────
    // Method: Linear Regression (OLS) + Week-over-Week — across ALL stores

    private function computeSalesTrend(): array
    {
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

        // OLS linear regression
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

        foreach ($filledData as $i => &$row) {
            $row['trend'] = round(max(0.0, $intercept + $slope * $i), 2);
        }
        unset($row);

        $thisWeek     = collect($filledData)->slice(-7)->sum('revenue');
        $lastWeek     = collect($filledData)->slice(-14, 7)->sum('revenue');
        $trendPercent = $lastWeek > 0 ? round((($thisWeek - $lastWeek) / $lastWeek) * 100, 1) : 0.0;
        $direction    = match (true) {
            $trendPercent >  5 => 'increasing',
            $trendPercent < -5 => 'decreasing',
            default            => 'stable',
        };
        $peakDay = collect($filledData)->sortByDesc('revenue')->first();

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

    // ── Section 2: Top Performing Stores ──────────────────────────────────────

    private function computeTopStores(): array
    {
        $now = now();

        return Store::where('status', 'approved')
            ->withCount(['orders as orders_count' => fn ($q) =>
                $q->whereNotIn('status', ['cancelled'])
                  ->whereYear('created_at', $now->year)
                  ->whereMonth('created_at', $now->month)
            ])
            ->withSum(['orders as revenue' => fn ($q) =>
                $q->whereNotIn('status', ['cancelled'])
                  ->whereYear('created_at', $now->year)
                  ->whereMonth('created_at', $now->month)
            ], 'total_amount')
            ->orderByDesc('orders_count')
            ->take(10)
            ->get()
            ->map(fn ($s, $i) => [
                'id'           => $s->id,
                'store_name'   => $s->store_name,
                'city'         => $s->city ?? '',
                'orders_count' => (int) $s->orders_count,
                'revenue'      => (float) ($s->revenue ?? 0),
                'rank'         => $i + 1,
            ])
            ->values()
            ->toArray();
    }

    // ── Section 3: Customer Growth ─────────────────────────────────────────────
    // New customer registrations per week, last 12 weeks

    private function computeCustomerGrowth(): array
    {
        $weeks = [];
        for ($i = 11; $i >= 0; $i--) {
            $start = now()->startOfWeek()->subWeeks($i);
            $end   = $start->copy()->endOfWeek();
            $count = User::where('role', 'customer')
                ->whereBetween('created_at', [$start, $end])
                ->count();
            $weeks[] = [
                'week'          => $start->format('M j'),
                'new_customers' => $count,
            ];
        }
        return $weeks;
    }

    // ── Section 4: Top Products Across Marketplace ────────────────────────────
    // Most-ordered products across all stores, last 30 days

    private function computeTopProducts(): array
    {
        return OrderItem::select(
                'order_items.product_id',
                DB::raw('SUM(order_items.quantity) as units_sold'),
                DB::raw('SUM(order_items.subtotal) as revenue')
            )
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->where('orders.created_at', '>=', now()->subDays(30))
            ->groupBy('order_items.product_id')
            ->orderByDesc('units_sold')
            ->take(10)
            ->with('product')
            ->get()
            ->map(fn ($item) => [
                'product_id' => $item->product_id,
                'name'       => $item->product?->name ?? '—',
                'brand'      => $item->product?->brand ?? '',
                'units_sold' => (int) $item->units_sold,
                'revenue'    => (float) $item->revenue,
            ])
            ->values()
            ->toArray();
    }

    // ── Section 5: Business Insights ──────────────────────────────────────────

    private function computeBusinessInsights(): array
    {
        $now = now();

        // Peak day of week (last 90 days)
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

        $dowNames = [1 => 'Sunday', 2 => 'Monday', 3 => 'Tuesday', 4 => 'Wednesday', 5 => 'Thursday', 6 => 'Friday', 7 => 'Saturday'];
        $peakDay  = $peakDayRow ? ($dowNames[$peakDayRow->dow] ?? 'Unknown') : null;
        $peakAvg  = $peakDayRow ? round($peakDayRow->total_orders / 13, 1) : 0;

        // Top store this month by order count
        $topStoreRow = DB::table('orders')
            ->join('stores', 'orders.store_id', '=', 'stores.id')
            ->select(
                'stores.id',
                'stores.store_name',
                'stores.city',
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(orders.total_amount) as total_revenue')
            )
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->whereYear('orders.created_at', $now->year)
            ->whereMonth('orders.created_at', $now->month)
            ->groupBy('stores.id', 'stores.store_name', 'stores.city')
            ->orderByDesc('orders_count')
            ->first();

        // Best-selling product this month (platform-wide)
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

        // Revenue projection from last 3 full months
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

        $thisMonthRevenue = (float) Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereYear('created_at', $now->year)
            ->whereMonth('created_at', $now->month)
            ->sum('total_amount');

        $thisMonthOrders = Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereYear('created_at', $now->year)
            ->whereMonth('created_at', $now->month)
            ->count();

        $totalApprovedStores = Store::where('status', 'approved')->count();

        return [
            'peak_day'             => $peakDay,
            'peak_avg_orders'      => $peakAvg,
            'top_store'            => $topStoreRow ? [
                'name'          => $topStoreRow->store_name,
                'city'          => $topStoreRow->city ?? '',
                'orders_count'  => (int) $topStoreRow->orders_count,
                'total_revenue' => (float) $topStoreRow->total_revenue,
            ] : null,
            'best_seller' => $bestSeller ? [
                'name'       => $bestSeller->product?->name ?? 'Unknown',
                'units_sold' => (int) $bestSeller->units_sold,
            ] : null,
            'revenue_projection'    => $projectedRevenue,
            'this_month_revenue'    => $thisMonthRevenue,
            'this_month_orders'     => $thisMonthOrders,
            'total_approved_stores' => $totalApprovedStores,
        ];
    }

    // ── Platform Insights ─────────────────────────────────────────────────────

    private function computePlatformInsights(): array
    {
        $now       = Carbon::now();
        $thisStart = $now->copy()->startOfMonth();
        $lastStart = $now->copy()->subMonth()->startOfMonth();
        $lastEnd   = $now->copy()->subMonth()->endOfMonth();

        // Revenue comparison
        $thisRevenue = (float) Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->where('created_at', '>=', $thisStart)
            ->sum('total_amount');

        $lastRevenue = (float) Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$lastStart, $lastEnd])
            ->sum('total_amount');

        $revenueChangePct = $lastRevenue > 0
            ? round((($thisRevenue - $lastRevenue) / $lastRevenue) * 100, 1)
            : null;

        // Commission earned this month
        $commissionThisMonth = (float) Invoice::whereNull('deleted_at')
            ->where('created_at', '>=', $thisStart)
            ->sum('platform_commission');

        // New sellers this month (stores created this month, any status)
        $newSellersThisMonth = Store::where('created_at', '>=', $thisStart)->count();

        // Pending seller verifications
        $pendingVerifications = Store::where('status', 'pending')->count();

        // New customers this month
        $newCustomersThisMonth = User::where('role', 'customer')
            ->where('created_at', '>=', $thisStart)
            ->count();

        $newCustomersLastMonth = User::where('role', 'customer')
            ->whereBetween('created_at', [$lastStart, $lastEnd])
            ->count();

        $customerChangePct = $newCustomersLastMonth > 0
            ? round((($newCustomersThisMonth - $newCustomersLastMonth) / $newCustomersLastMonth) * 100, 1)
            : null;

        // Active vs inactive sellers (stores with 0 orders this month)
        $totalApproved = Store::where('status', 'approved')->count();
        $activeThisMonth = Store::where('status', 'approved')
            ->whereHas('orders', fn ($q) => $q->where('created_at', '>=', $thisStart))
            ->count();
        $inactiveCount = $totalApproved - $activeThisMonth;

        // Week-over-week customer growth (last 2 weeks)
        $thisWeekCustomers = User::where('role', 'customer')
            ->where('created_at', '>=', $now->copy()->startOfWeek())
            ->count();

        // Platform-wide order success rate (delivered vs total last 30 days)
        $totalOrders30d = Order::whereNull('deleted_at')
            ->where('created_at', '>=', $now->copy()->subDays(30))
            ->count();
        $deliveredOrders30d = Order::whereNull('deleted_at')
            ->where('status', 'delivered')
            ->where('created_at', '>=', $now->copy()->subDays(30))
            ->count();
        $orderSuccessRate = $totalOrders30d > 0
            ? (int) round(($deliveredOrders30d / $totalOrders30d) * 100)
            : null;

        // Recommendations
        $recs = [];

        if ($pendingVerifications > 0) {
            $recs[] = ['type' => 'warning', 'text' => "{$pendingVerifications} seller application(s) are pending verification. Review and approve or reject them to keep the marketplace active."];
        }
        if ($revenueChangePct !== null && $revenueChangePct >= 15) {
            $recs[] = ['type' => 'success', 'text' => "Platform revenue is up {$revenueChangePct}% from last month. Consider investing in seller growth programs to sustain momentum."];
        } elseif ($revenueChangePct !== null && $revenueChangePct < -10) {
            $recs[] = ['type' => 'warning', 'text' => "Platform revenue dropped " . abs($revenueChangePct) . "% from last month. Investigate underperforming stores and review pricing or promotions."];
        }
        if ($inactiveCount > 0 && $totalApproved > 0) {
            $recs[] = ['type' => 'info', 'text' => "{$inactiveCount} approved store(s) have no orders this month. Consider reaching out to inactive sellers to re-engage them."];
        }
        if ($customerChangePct !== null && $customerChangePct < -20) {
            $recs[] = ['type' => 'warning', 'text' => "New customer registrations dropped " . abs($customerChangePct) . "% vs last month. Review the registration flow and marketing reach."];
        }
        if ($orderSuccessRate !== null && $orderSuccessRate < 80) {
            $recs[] = ['type' => 'warning', 'text' => "Platform order completion rate is {$orderSuccessRate}% in the last 30 days. High cancellation/failure rate may indicate delivery or stock issues across stores."];
        }
        if (empty($recs)) {
            $recs[] = ['type' => 'info', 'text' => 'Platform is operating smoothly with no critical issues. Continue monitoring seller performance and customer acquisition trends.'];
        }

        return [
            'this_month_revenue'     => round($thisRevenue, 2),
            'last_month_revenue'     => round($lastRevenue, 2),
            'revenue_change_pct'     => $revenueChangePct,
            'commission_this_month'  => round($commissionThisMonth, 2),
            'new_sellers_this_month' => $newSellersThisMonth,
            'pending_verifications'  => $pendingVerifications,
            'new_customers_this_month' => $newCustomersThisMonth,
            'new_customers_last_month' => $newCustomersLastMonth,
            'customer_change_pct'    => $customerChangePct,
            'active_stores_this_month' => $activeThisMonth,
            'inactive_stores'        => $inactiveCount,
            'total_approved_stores'  => $totalApproved,
            'order_success_rate'     => $orderSuccessRate,
            'this_week_customers'    => $thisWeekCustomers,
            'recommendations'        => $recs,
        ];
    }
}
