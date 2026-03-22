<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Rating;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ReportsController extends Controller
{
    private function parseDateRange(Request $request): array
    {
        $from = $request->input('date_from')
            ? Carbon::parse($request->input('date_from'))->startOfDay()
            : Carbon::now()->startOfMonth()->startOfDay();

        $to = $request->input('date_to')
            ? Carbon::parse($request->input('date_to'))->endOfDay()
            : Carbon::now()->endOfDay();

        return [$from, $to];
    }

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'commission');
        [$from, $to] = $this->parseDateRange($request);

        $data = match ($tab) {
            'commission' => $this->commissionData($from, $to),
            'users'      => $this->usersData($from, $to),
            'stores'     => $this->storesData($from, $to),
            'orders'     => $this->ordersData($from, $to),
            'ratings'    => $this->ratingsData($from, $to),
            default      => $this->commissionData($from, $to),
        };

        return Inertia::render('admin/reports', array_merge($data, [
            'tab'       => $tab,
            'date_from' => $from->format('M d, Y'),
            'date_from_raw' => $from->toDateString(),
            'date_to'   => $to->format('M d, Y'),
            'date_to_raw'   => $to->toDateString(),
        ]));
    }

    // ── Tab 1: Commission ─────────────────────────────────────────────────────

    private function commissionData(Carbon $from, Carbon $to): array
    {
        $totalCommission = (float) Invoice::whereBetween('created_at', [$from, $to])
            ->sum('platform_commission');

        $totalGmv = (float) Order::whereNull('deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->sum('total_amount');

        // Commission by month (last 12 months, regardless of date range)
        $monthlyChart = collect(range(11, 0))->map(function (int $monthsAgo) {
            $date = Carbon::now()->subMonths($monthsAgo)->startOfMonth();
            return [
                'month'      => $date->format('M Y'),
                'commission' => (float) Invoice::whereYear('created_at', $date->year)
                    ->whereMonth('created_at', $date->month)
                    ->sum('platform_commission'),
            ];
        })->values();

        // Per-store commission breakdown within date range
        $storeBreakdown = Store::where('status', 'approved')->get()
            ->map(function ($store) use ($from, $to) {
                $orders = (int) $store->orders()
                    ->whereNotIn('status', ['cancelled'])
                    ->whereBetween('created_at', [$from, $to])
                    ->count();
                $gmv = (float) $store->orders()
                    ->whereNotIn('status', ['cancelled'])
                    ->whereBetween('created_at', [$from, $to])
                    ->sum('total_amount');
                $commission = (float) Invoice::whereHas('order', fn ($q) =>
                    $q->where('store_id', $store->id)
                      ->whereNotIn('status', ['cancelled'])
                      ->whereBetween('created_at', [$from, $to])
                )->sum('platform_commission');
                return [
                    'store_id'       => $store->id,
                    'store_name'     => $store->store_name,
                    'city'           => $store->city ?? '',
                    'commission_rate'=> (float) $store->commission_rate,
                    'orders'         => $orders,
                    'gmv'            => $gmv,
                    'commission'     => $commission,
                ];
            })
            ->filter(fn ($s) => $s['orders'] > 0)
            ->sortByDesc('commission')
            ->values()
            ->all();

        return [
            'commission' => [
                'total_commission' => $totalCommission,
                'total_gmv'        => $totalGmv,
                'monthly_chart'    => $monthlyChart,
                'store_breakdown'  => $storeBreakdown,
            ],
        ];
    }

    // ── Tab 2: Users ──────────────────────────────────────────────────────────

    private function usersData(Carbon $from, Carbon $to): array
    {
        $totalUsers    = User::count();
        $totalBuyers   = User::where('role', 'customer')->count();
        $totalSellers  = User::where('role', 'seller')->count();
        $newInRange    = User::whereBetween('created_at', [$from, $to])->count();
        $verifiedUsers = User::where('id_verified', true)->count();

        // Weekly registrations — last 12 weeks
        $weeklyChart = collect(range(11, 0))->map(function (int $weeksAgo) {
            $start = Carbon::now()->startOfWeek()->subWeeks($weeksAgo);
            $end   = $start->copy()->endOfWeek();
            return [
                'week'   => $start->format('M j'),
                'buyers' => User::where('role', 'customer')->whereBetween('created_at', [$start, $end])->count(),
                'sellers'=> User::where('role', 'seller')->whereBetween('created_at', [$start, $end])->count(),
            ];
        })->values();

        // Role breakdown for pie chart
        $byRole = User::select('role', DB::raw('COUNT(*) as count'))
            ->groupBy('role')
            ->get()
            ->map(fn ($r) => ['role' => $r->role, 'count' => (int) $r->count])
            ->values()
            ->all();

        return [
            'users' => [
                'total_users'    => $totalUsers,
                'total_buyers'   => $totalBuyers,
                'total_sellers'  => $totalSellers,
                'new_in_range'   => $newInRange,
                'verified_users' => $verifiedUsers,
                'weekly_chart'   => $weeklyChart,
                'by_role'        => $byRole,
            ],
        ];
    }

    // ── Tab 3: Stores ─────────────────────────────────────────────────────────

    private function storesData(Carbon $from, Carbon $to): array
    {
        $total    = Store::count();
        $approved = Store::where('status', 'approved')->count();
        $pending  = Store::where('status', 'pending')->count();
        $rejected = Store::where('status', 'rejected')->count();
        $suspended= Store::where('status', 'suspended')->count();

        // Top stores by order count (all time)
        $topStores = Store::withCount(['orders as orders_count' => fn ($q) =>
                $q->whereNotIn('status', ['cancelled'])
            ])
            ->withSum(['orders as gmv' => fn ($q) =>
                $q->whereNotIn('status', ['cancelled'])
            ], 'total_amount')
            ->orderByDesc('orders_count')
            ->take(10)
            ->get()
            ->map(fn ($s, $i) => [
                'id'           => $s->id,
                'store_name'   => $s->store_name,
                'city'         => $s->city ?? '',
                'status'       => $s->status,
                'orders_count' => (int) $s->orders_count,
                'gmv'          => (float) ($s->gmv ?? 0),
                'rank'         => $i + 1,
            ])
            ->values()
            ->all();

        return [
            'stores' => [
                'total'     => $total,
                'approved'  => $approved,
                'pending'   => $pending,
                'rejected'  => $rejected,
                'suspended' => $suspended,
                'top_stores'=> $topStores,
                'status_chart' => [
                    ['name' => 'Approved',  'value' => $approved,  'color' => '#10b981'],
                    ['name' => 'Pending',   'value' => $pending,   'color' => '#f59e0b'],
                    ['name' => 'Rejected',  'value' => $rejected,  'color' => '#ef4444'],
                    ['name' => 'Suspended', 'value' => $suspended, 'color' => '#6b7280'],
                ],
            ],
        ];
    }

    // ── Tab 4: Orders ─────────────────────────────────────────────────────────

    private function ordersData(Carbon $from, Carbon $to): array
    {
        $totalOrders = Order::whereNull('deleted_at')->whereBetween('created_at', [$from, $to])->count();

        // By status
        $byStatus = Order::whereNull('deleted_at')
            ->whereBetween('created_at', [$from, $to])
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get()
            ->map(fn ($r) => ['status' => $r->status, 'count' => (int) $r->count])
            ->values()
            ->all();

        $statusColors = [
            'pending'          => '#f59e0b',
            'confirmed'        => '#3b82f6',
            'preparing'        => '#8b5cf6',
            'out_for_delivery' => '#f97316',
            'delivered'        => '#10b981',
            'cancelled'        => '#ef4444',
        ];

        $statusChart = collect($byStatus)->map(fn ($r) => [
            'name'  => str_replace('_', ' ', $r['status']),
            'value' => $r['count'],
            'color' => $statusColors[$r['status']] ?? '#94a3b8',
        ])->values()->all();

        // By payment method
        $byPayment = Order::whereNull('deleted_at')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('payment_method')
            ->select('payment_method', DB::raw('COUNT(*) as count'))
            ->groupBy('payment_method')
            ->get()
            ->map(fn ($r) => ['method' => $r->payment_method, 'count' => (int) $r->count])
            ->values()
            ->all();

        // Daily trend
        $dailyTrend = Order::whereNull('deleted_at')
            ->whereBetween('created_at', [$from, $to])
            ->select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders'),
                DB::raw('SUM(total_amount) as gmv')
            )
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($r) => [
                'date'   => Carbon::parse($r->date)->format('M d, Y'),
                'orders' => (int) $r->orders,
                'gmv'    => (float) $r->gmv,
            ])
            ->values()
            ->all();

        return [
            'orders' => [
                'total_orders' => $totalOrders,
                'status_chart' => $statusChart,
                'payment_chart'=> $byPayment,
                'daily_trend'  => $dailyTrend,
            ],
        ];
    }

    // ── Tab 5: Ratings ────────────────────────────────────────────────────────

    private function ratingsData(Carbon $from, Carbon $to): array
    {
        $totalReviews  = Rating::count();
        $platformAvg   = $totalReviews > 0 ? (float) Rating::avg('rating') : 0.0;

        // Star breakdown (all-time)
        $breakdown = Rating::select('rating', DB::raw('COUNT(*) as count'))
            ->groupBy('rating')
            ->pluck('count', 'rating')
            ->toArray();

        // Top-rated stores (min 5 reviews, all-time)
        $topRated = Store::where('status', 'approved')
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->having('ratings_count', '>=', 5)
            ->orderByDesc('ratings_avg_rating')
            ->take(10)
            ->get()
            ->map(fn ($s, $i) => [
                'id'          => $s->id,
                'store_name'  => $s->store_name,
                'city'        => $s->city ?? '',
                'avg_rating'  => round((float) ($s->ratings_avg_rating ?? 0), 2),
                'review_count'=> (int) $s->ratings_count,
                'rank'        => $i + 1,
            ])
            ->values()
            ->all();

        // Monthly review volume — last 12 months
        $monthlyChart = collect(range(11, 0))->map(function (int $monthsAgo) {
            $date = Carbon::now()->subMonths($monthsAgo)->startOfMonth();
            return [
                'month' => $date->format('M Y'),
                'count' => (int) Rating::whereYear('created_at', $date->year)
                    ->whereMonth('created_at', $date->month)
                    ->count(),
            ];
        })->values();

        return [
            'ratings' => [
                'platform_avg'  => $platformAvg,
                'total_reviews' => $totalReviews,
                'breakdown'     => $breakdown,
                'top_rated'     => $topRated,
                'monthly_chart' => $monthlyChart,
            ],
        ];
    }
}
