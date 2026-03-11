<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\Order;
use Carbon\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(): Response
    {
        $today = Carbon::today();

        // ── Summary stats ──────────────────────────────────────────────────
        $ordersToday = Order::whereDate('created_at', $today)->count();

        $revenueToday = (float) Order::whereDate('created_at', $today)
            ->where('payment_status', 'paid')
            ->sum('total_amount');

        $pendingOrders = Order::where('status', 'pending')->count();

        $lowStockAlerts = Inventory::whereColumn('quantity', '<=', 'reorder_level')->count();

        $activeDeliveries = Delivery::whereIn('status', ['assigned', 'picked_up', 'in_transit'])->count();

        // ── Bar chart — daily sales last 7 days ───────────────────────────
        $salesChart = collect(range(6, 0))->map(function (int $daysAgo) {
            $date = Carbon::today()->subDays($daysAgo);

            return [
                'date'    => $date->format('D'),   // Mon … Sun
                'full'    => $date->format('M d'), // Mar 01
                'orders'  => Order::whereDate('created_at', $date)->count(),
                'revenue' => (float) Order::whereDate('created_at', $date)
                    ->where('payment_status', 'paid')
                    ->sum('total_amount'),
            ];
        })->values();

        // ── Pie chart — order status breakdown ────────────────────────────
        $statusChart = Order::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->get()
            ->map(fn ($r) => [
                'status' => ucfirst(str_replace('_', ' ', $r->status)),
                'count'  => (int) $r->count,
            ])
            ->values();

        // ── Recent 10 orders ──────────────────────────────────────────────
        $recentOrders = Order::with('customer')
            ->latest()
            ->take(10)
            ->get()
            ->map(fn ($o) => [
                'order_number'  => $o->order_number,
                'customer_name' => $o->customer?->name ?? '—',
                'total_amount'  => (float) $o->total_amount,
                'status'        => $o->status,
                'created_at'    => $o->created_at->format('M d, Y'),
            ]);

        // ── Low stock products ─────────────────────────────────────────────
        $lowStockProducts = Inventory::with('product')
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->orderBy('quantity')
            ->get()
            ->map(fn ($i) => [
                'name'          => $i->product?->name ?? '—',
                'quantity'      => $i->quantity,
                'reorder_level' => $i->reorder_level,
                'critical'      => $i->quantity === 0,
            ]);

        // ── Active deliveries ─────────────────────────────────────────────
        $activeDeliveriesList = Delivery::with(['order', 'rider'])
            ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])
            ->latest()
            ->take(10)
            ->get()
            ->map(fn ($d) => [
                'order_number' => $d->order?->order_number ?? '—',
                'rider_name'   => $d->rider?->name ?? 'Unassigned',
                'status'       => $d->status,
            ]);

        return Inertia::render('admin/dashboard', [
            'stats' => [
                'ordersToday'      => $ordersToday,
                'revenueToday'     => $revenueToday,
                'pendingOrders'    => $pendingOrders,
                'lowStockAlerts'   => $lowStockAlerts,
                'activeDeliveries' => $activeDeliveries,
            ],
            'salesChart'          => $salesChart,
            'statusChart'         => $statusChart,
            'recentOrders'        => $recentOrders,
            'lowStockProducts'    => $lowStockProducts,
            'activeDeliveries'    => $activeDeliveriesList,
        ]);
    }
}
