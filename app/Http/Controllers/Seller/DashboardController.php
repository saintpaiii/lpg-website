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

        // Sales this month (delivered orders) — the store keeps the full amount
        $deliveredThisMonth = $store->orders()
            ->where('status', 'delivered')
            ->whereMonth('created_at', now()->month)
            ->whereYear('created_at', now()->year);
        $revenueThisMonth   = (float) (clone $deliveredThisMonth)->sum('total_amount');
        $deliveredCount     = (clone $deliveredThisMonth)->count();
        $averageOrderValue  = $deliveredCount > 0 ? round($revenueThisMonth / $deliveredCount, 2) : 0;

        $revenueAllTime = (float) $store->orders()
            ->where('status', 'delivered')
            ->sum('total_amount');

        // ── Daily orders + revenue — last 30 days ─────────────────────────────
        $ordersChart = collect(range(29, 0))->map(function (int $daysAgo) use ($store) {
            $date = Carbon::today()->subDays($daysAgo);
            $revenue = (float) $store->orders()
                ->where('status', 'delivered')
                ->whereDate('created_at', $date)
                ->sum('total_amount');
            return [
                'date'    => $date->format('M d'),
                'short'   => $date->format('d'),
                'orders'  => $store->orders()->whereDate('created_at', $date)->count(),
                'revenue' => $revenue,
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
                'deliveredThisMonth'  => $deliveredCount,
                'averageOrderValue'   => $averageOrderValue,
            ],
            'ordersChart'  => $ordersChart,
            'recentOrders' => $recentOrders,
            'lowStock'     => $lowStock,
        ]);
    }
}
