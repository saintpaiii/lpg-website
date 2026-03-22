<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Http\Request;
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
        $store = $request->attributes->get('seller_store');
        [$from, $to] = $this->parseDateRange($request);

        // Daily revenue rows
        $dailyRows = Order::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as gross_revenue')
            )
            ->where('store_id', $store->id)
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // Commission per day
        $commissionByDate = Invoice::select(
                DB::raw('DATE(invoices.created_at) as date'),
                DB::raw('SUM(platform_commission) as commission')
            )
            ->join('orders', 'invoices.order_id', '=', 'orders.id')
            ->where('orders.store_id', $store->id)
            ->whereNull('invoices.deleted_at')
            ->whereNull('orders.deleted_at')
            ->whereBetween('invoices.created_at', [$from, $to])
            ->groupBy(DB::raw('DATE(invoices.created_at)'))
            ->get()
            ->keyBy('date');

        $chart = $dailyRows->map(function ($r) use ($commissionByDate) {
            $gross      = (float) $r->gross_revenue;
            $commission = (float) ($commissionByDate[$r->date]?->commission ?? 0);
            return [
                'date'        => $r->date,
                'orders'      => (int) $r->orders_count,
                'gross'       => $gross,
                'commission'  => $commission,
                'net'         => $gross - $commission,
            ];
        })->values()->all();

        $totalGross      = collect($chart)->sum('gross');
        $totalCommission = collect($chart)->sum('commission');
        $totalNet        = $totalGross - $totalCommission;
        $totalOrders     = collect($chart)->sum('orders');

        return Inertia::render('seller/reports', [
            'date_from' => $from->toDateString(),
            'date_to'   => $to->toDateString(),
            'summary' => [
                'gross_revenue'   => round($totalGross, 2),
                'platform_fees'   => round($totalCommission, 2),
                'net_revenue'     => round($totalNet, 2),
                'total_orders'    => $totalOrders,
                'commission_rate' => (float) $store->commission_rate,
            ],
            'chart' => $chart,
        ]);
    }
}
