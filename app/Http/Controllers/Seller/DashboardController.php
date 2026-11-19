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

        // K9: sales = what customers paid (items + delivery fee) for delivered + paid orders — RevenueService, the
        // same number as Revenue, Reports, the receipts and the Main dashboard
        $month              = \App\Services\RevenueService::summary($store->id, now()->startOfMonth(), now()->endOfMonth());
        $revenueThisMonth   = $month['sales'];
        $deliveredCount     = $month['orders'];
        $averageOrderValue  = $deliveredCount > 0 ? round($revenueThisMonth / $deliveredCount, 2) : 0;

        $revenueAllTime = \App\Services\RevenueService::salesFor($store->id);
        $byDay = \App\Services\RevenueService::byDay($store->id, Carbon::today()->subDays(29), Carbon::today()->endOfDay());

        // ── Daily orders + revenue — last 30 days ─────────────────────────────
        $ordersChart = collect(range(29, 0))->map(function (int $daysAgo) use ($store, $byDay) {
            $date = Carbon::today()->subDays($daysAgo);
            $revenue = (float) ($byDay[$date->toDateString()][$store->id] ?? 0);
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
                // What the customer pays (items + delivery fee) — shown in the list
                'grand_total'  => $o->grandTotal(),
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
            // J4: opening status + the "Closed today" switch (shown to people who can open Settings)
            'hours_status' => \App\Support\StoreHours::status($store),
            'closed_today' => \App\Support\StoreHours::closedToday($store),
            'stats' => [
                'totalProducts'       => $totalProducts,
                'activeProducts'      => $activeProducts,
                'totalOrders'         => $totalOrders,
                'pendingOrders'       => $pendingOrders,
                'revenueThisMonth'    => $revenueThisMonth,
                // "of which delivery fees" (K9)
                'deliveryFeesThisMonth' => $month['delivery_fees'],
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
