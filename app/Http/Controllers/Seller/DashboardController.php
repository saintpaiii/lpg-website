<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Order;
use Carbon\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(): Response
    {
        $store = request()->attributes->get('seller_store');
        $today = Carbon::today();

        // ── Stats ─────────────────────────────────────────────────────────────
        $totalProducts  = $store->products()->count();
        $activeProducts = $store->products()->where('is_active', true)->count();

        $totalOrders   = $store->orders()->count();
        $pendingOrders = $store->orders()->where('status', 'pending')->count();

        $revenueThisMonth = (float) $store->orders()
            ->where('status', 'delivered')
            ->whereMonth('created_at', now()->month)
            ->whereYear('created_at', now()->year)
            ->sum('total_amount');

        $revenueAllTime = (float) $store->orders()
            ->where('status', 'delivered')
            ->sum('total_amount');

        $commissionThisMonth = round($revenueThisMonth * (float) $store->commission_rate / 100, 2);
        $netRevenueThisMonth = $revenueThisMonth - $commissionThisMonth;

        // ── Daily orders + revenue — last 30 days ─────────────────────────────
        $ordersChart = collect(range(29, 0))->map(function (int $daysAgo) use ($store) {
            $date = Carbon::today()->subDays($daysAgo);
            $revenue = (float) $store->orders()
                ->where('status', 'delivered')
                ->whereDate('created_at', $date)
                ->sum('total_amount');
            $commission = round($revenue * (float) $store->commission_rate / 100, 2);
            return [
                'date'        => $date->format('M d'),
                'short'       => $date->format('d'),
                'orders'      => $store->orders()->whereDate('created_at', $date)->count(),
                'revenue'     => $revenue,
                'net_revenue' => $revenue - $commission,
            ];
        })->values();

        // ── Recent orders ─────────────────────────────────────────────────────
        $recentOrders = $store->orders()
            ->with('customer')
            ->latest()
            ->take(8)
            ->get()
            ->map(fn ($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'customer'     => $o->customer?->name ?? '—',
                'total_amount' => (float) $o->total_amount,
                'status'       => $o->status,
                'created_at'   => $o->created_at->format('M d, Y'),
            ]);

        // ── Low stock alerts ─────────────────────────────────────────────────
        $lowStock = Inventory::whereHas('product', fn ($q) => $q->where('store_id', $store->id)->where('is_active', true))
            ->with('product')
            ->get()
            ->filter(fn ($inv) => $inv->quantity <= $inv->reorder_level)
            ->map(fn ($inv) => [
                'product_id'    => $inv->product->id,
                'product_name'  => $inv->product->name,
                'brand'         => $inv->product->brand,
                'quantity'      => $inv->quantity,
                'reorder_level' => $inv->reorder_level,
            ])
            ->values();

        return Inertia::render('seller/dashboard', [
            'stats' => [
                'totalProducts'       => $totalProducts,
                'activeProducts'      => $activeProducts,
                'totalOrders'         => $totalOrders,
                'pendingOrders'       => $pendingOrders,
                'revenueThisMonth'    => $revenueThisMonth,
                'revenueAllTime'      => $revenueAllTime,
                'commissionRate'      => (float) $store->commission_rate,
                'commissionThisMonth' => $commissionThisMonth,
                'netRevenueThisMonth' => $netRevenueThisMonth,
            ],
            'ordersChart'  => $ordersChart,
            'recentOrders' => $recentOrders,
            'lowStock'     => $lowStock,
        ]);
    }
}
