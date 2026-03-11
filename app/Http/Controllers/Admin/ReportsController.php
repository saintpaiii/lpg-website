<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ReportsController extends Controller
{
    // ── Default date range: current month ─────────────────────────────────────

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

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'sales');
        [$from, $to] = $this->parseDateRange($request);

        $data = match ($tab) {
            'sales'     => $this->salesData($from, $to),
            'products'  => $this->productData($from, $to),
            'customers' => $this->customerData($from, $to),
            'delivery'  => $this->deliveryData($from, $to),
            'inventory' => $this->inventoryData($from, $to),
            default     => $this->salesData($from, $to),
        };

        return Inertia::render('admin/reports', array_merge($data, [
            'tab'       => $tab,
            'date_from' => $from->toDateString(),
            'date_to'   => $to->toDateString(),
        ]));
    }

    // ── Tab 1: Sales ──────────────────────────────────────────────────────────

    private function salesData(Carbon $from, Carbon $to): array
    {
        // Daily revenue rows (exclude cancelled orders)
        $dailyRows = Order::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as revenue')
            )
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->map(fn ($r) => [
                'date'         => $r->date,
                'orders_count' => (int) $r->orders_count,
                'revenue'      => (float) $r->revenue,
            ]);

        $totalRevenue = $dailyRows->sum('revenue');
        $totalOrders  = $dailyRows->sum('orders_count');
        $avgOrder     = $totalOrders > 0 ? $totalRevenue / $totalOrders : 0;

        return [
            'sales' => [
                'chart'         => $dailyRows->values()->all(),
                'total_revenue' => $totalRevenue,
                'total_orders'  => $totalOrders,
                'avg_order'     => round($avgOrder, 2),
            ],
        ];
    }

    // ── Tab 2: Products ───────────────────────────────────────────────────────

    private function productData(Carbon $from, Carbon $to): array
    {
        $rows = OrderItem::select(
                'order_items.product_id',
                DB::raw('SUM(order_items.quantity) as units_sold'),
                DB::raw('SUM(order_items.subtotal) as revenue')
            )
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->join('products', 'order_items.product_id', '=', 'products.id')
            ->whereNull('order_items.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereNull('products.deleted_at')
            ->whereNotIn('orders.status', ['cancelled'])
            ->whereBetween('orders.created_at', [$from, $to])
            ->groupBy('order_items.product_id')
            ->orderByDesc('units_sold')
            ->with('product')
            ->get()
            ->map(fn ($r) => [
                'product_id'  => $r->product_id,
                'name'        => $r->product?->name ?? 'Unknown',
                'brand'       => $r->product?->brand ?? '',
                'units_sold'  => (int) $r->units_sold,
                'revenue'     => (float) $r->revenue,
                'profit'      => (float) $r->revenue - ((float) ($r->product?->cost_price ?? 0) * (int) $r->units_sold),
            ]);

        return [
            'products' => [
                'table' => $rows->values()->all(),
                'chart' => $rows->take(10)->map(fn ($r) => [
                    'name'       => $r['name'],
                    'units_sold' => $r['units_sold'],
                    'revenue'    => $r['revenue'],
                ])->values()->all(),
            ],
        ];
    }

    // ── Tab 3: Customers ──────────────────────────────────────────────────────

    private function customerData(Carbon $from, Carbon $to): array
    {
        $rows = Order::select(
                'customer_id',
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as total_spent'),
                DB::raw('MAX(created_at) as last_order_at')
            )
            ->whereNull('orders.deleted_at')
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('customer_id')
            ->orderByDesc('total_spent')
            ->limit(10)
            ->with('customer')
            ->get()
            ->map(fn ($r) => [
                'customer_id'   => $r->customer_id,
                'name'          => $r->customer?->name ?? 'Unknown',
                'phone'         => $r->customer?->phone ?? '',
                'orders_count'  => (int) $r->orders_count,
                'total_spent'   => (float) $r->total_spent,
                'last_order_at' => Carbon::parse($r->last_order_at)->format('M d, Y'),
            ]);

        return [
            'customers' => [
                'table' => $rows->values()->all(),
                'chart' => $rows->take(10)->map(fn ($r) => [
                    'name'        => $r['name'],
                    'total_spent' => $r['total_spent'],
                ])->values()->all(),
            ],
        ];
    }

    // ── Tab 4: Delivery ───────────────────────────────────────────────────────

    private function deliveryData(Carbon $from, Carbon $to): array
    {
        $rows = Delivery::select(
                'rider_id',
                DB::raw('COUNT(*) as total_deliveries'),
                DB::raw("SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count"),
                DB::raw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count")
            )
            ->whereNull('deliveries.deleted_at')
            ->whereBetween('assigned_at', [$from, $to])
            ->groupBy('rider_id')
            ->with('rider')
            ->get()
            ->map(fn ($r) => [
                'rider_id'         => $r->rider_id,
                'name'             => $r->rider?->name ?? 'Unknown',
                'total_deliveries' => (int) $r->total_deliveries,
                'delivered'        => (int) $r->delivered_count,
                'failed'           => (int) $r->failed_count,
                'success_rate'     => $r->total_deliveries > 0
                    ? round(($r->delivered_count / $r->total_deliveries) * 100, 1)
                    : 0,
            ]);

        $totalDeliveries = $rows->sum('total_deliveries');
        $totalDelivered  = $rows->sum('delivered');
        $successRate     = $totalDeliveries > 0
            ? round(($totalDelivered / $totalDeliveries) * 100, 1)
            : 0;

        return [
            'delivery' => [
                'table'            => $rows->values()->all(),
                'chart'            => $rows->map(fn ($r) => [
                    'name'      => $r['name'],
                    'delivered' => $r['delivered'],
                    'failed'    => $r['failed'],
                ])->values()->all(),
                'total_deliveries' => $totalDeliveries,
                'total_delivered'  => $totalDelivered,
                'success_rate'     => $successRate,
            ],
        ];
    }

    // ── Tab 5: Inventory ──────────────────────────────────────────────────────

    private function inventoryData(Carbon $from, Carbon $to): array
    {
        // Current stock per product from inventory table
        $inventories = Inventory::whereNull('inventories.deleted_at')
            ->with(['product' => fn ($q) => $q->whereNull('deleted_at')])
            ->get()
            ->filter(fn ($inv) => $inv->product !== null);

        // Aggregate transactions per product within date range
        $txSummary = InventoryTransaction::select(
                'product_id',
                DB::raw("SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END) as stock_in"),
                DB::raw("SUM(CASE WHEN type IN ('out', 'order') THEN quantity ELSE 0 END) as stock_out")
            )
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('product_id')
            ->get()
            ->keyBy('product_id');

        $table = $inventories->map(fn ($inv) => [
            'product_id'    => $inv->product_id,
            'name'          => $inv->product->name,
            'brand'         => $inv->product->brand ?? '',
            'current_stock' => (int) $inv->quantity,
            'reorder_level' => (int) $inv->reorder_level,
            'stock_in'      => (int) ($txSummary[$inv->product_id]?->stock_in ?? 0),
            'stock_out'     => (int) ($txSummary[$inv->product_id]?->stock_out ?? 0),
            'low_stock'     => $inv->quantity <= $inv->reorder_level,
        ])->sortBy('name')->values()->all();

        $chart = collect($table)->map(fn ($r) => [
            'name'          => $r['name'],
            'current_stock' => $r['current_stock'],
            'reorder_level' => $r['reorder_level'],
        ])->values()->all();

        return [
            'inventory' => [
                'table' => $table,
                'chart' => $chart,
            ],
        ];
    }
}
