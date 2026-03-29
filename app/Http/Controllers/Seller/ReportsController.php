<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Invoice;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ReportsController extends Controller
{
    use GeneratesExport;
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

    public function export(Request $request)
    {
        $store = $request->attributes->get('seller_store');
        [$from, $to] = $this->parseDateRange($request);
        $format = $request->get('format', 'csv');

        $dailyRows = Order::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as gross_revenue')
            )
            ->where('store_id', $store->id)
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('date')->orderBy('date')->get();

        $commissionByDate = Invoice::select(
                DB::raw('DATE(invoices.created_at) as date'),
                DB::raw('SUM(platform_commission) as commission')
            )
            ->join('orders', 'invoices.order_id', '=', 'orders.id')
            ->where('orders.store_id', $store->id)
            ->whereNull('invoices.deleted_at')->whereNull('orders.deleted_at')
            ->whereBetween('invoices.created_at', [$from, $to])
            ->groupBy(DB::raw('DATE(invoices.created_at)'))->get()->keyBy('date');

        $rows = $dailyRows->map(function ($r) use ($commissionByDate) {
            $gross      = (float) $r->gross_revenue;
            $commission = (float) ($commissionByDate[$r->date]?->commission ?? 0);
            return ['date' => Carbon::parse($r->date)->format('M d, Y'), 'orders' => (int) $r->orders_count, 'gross' => $gross, 'commission' => $commission, 'net' => $gross - $commission];
        })->values()->all();

        $totalGross      = collect($rows)->sum('gross');
        $totalCommission = collect($rows)->sum('commission');
        $totalOrders     = collect($rows)->sum('orders');
        $filename = $this->exportFilename('revenue_report', $store->store_name, $from->toDateString(), $to->toDateString(), $format);

        if ($format === 'pdf') {
            $columns = [
                ['key' => 'date',       'label' => 'Date'],
                ['key' => 'orders',     'label' => 'Orders'],
                ['key' => 'gross_fmt',  'label' => 'Gross Revenue',  'align' => 'right'],
                ['key' => 'comm_fmt',   'label' => 'Commission',     'align' => 'right'],
                ['key' => 'net_fmt',    'label' => 'Net Revenue',    'align' => 'right'],
            ];
            $pdfRows = array_map(fn ($r) => array_merge($r, [
                'gross_fmt' => $this->peso($r['gross']),
                'comm_fmt'  => $this->peso($r['commission']),
                'net_fmt'   => $this->peso($r['net']),
            ]), $rows);
            return $this->pdfResponse($filename, [
                'title'        => 'Revenue Report',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $from->format('M d, Y') . ' – ' . $to->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Gross Revenue',   'value' => $this->peso($totalGross)],
                    ['label' => 'Commission Paid',  'value' => $this->peso($totalCommission)],
                    ['label' => 'Net Revenue',      'value' => $this->peso($totalGross - $totalCommission)],
                    ['label' => 'Total Orders',     'value' => $totalOrders],
                ],
                'columns'      => $columns,
                'rows'         => $pdfRows,
                'totalsRow'    => ['date' => 'TOTAL', 'orders' => $totalOrders, 'gross_fmt' => $this->peso($totalGross), 'comm_fmt' => $this->peso($totalCommission), 'net_fmt' => $this->peso($totalGross - $totalCommission)],
            ]);
        }

        $headings = ['Date', 'Orders', 'Gross Revenue', 'Commission', 'Net Revenue'];
        $csvRows  = array_map(fn ($r) => [$r['date'], $r['orders'], number_format($r['gross'], 2), number_format($r['commission'], 2), number_format($r['net'], 2)], $rows);
        $csvRows[] = ['TOTAL', $totalOrders, number_format($totalGross, 2), number_format($totalCommission, 2), number_format($totalGross - $totalCommission, 2)];
        return $this->csvResponse($filename, $headings, $csvRows);
    }
}
