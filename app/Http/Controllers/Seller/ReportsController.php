<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
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

        $chart = $this->dailyRows($store->id, $from, $to)->map(fn ($r) => [
            'date'   => $r->date,
            'orders' => (int) $r->orders_count,
            'gross'  => (float) $r->gross_revenue,
        ])->values()->all();

        $totalGross  = collect($chart)->sum('gross');
        $totalOrders = collect($chart)->sum('orders');

        return Inertia::render('seller/reports', [
            'date_from' => $from->toDateString(),
            'date_to'   => $to->toDateString(),
            'summary' => [
                'gross_revenue'       => round($totalGross, 2),
                'total_orders'        => $totalOrders,
                'average_order_value' => $totalOrders > 0 ? round($totalGross / $totalOrders, 2) : 0,
            ],
            'chart' => $chart,
        ]);
    }

    /** Orders (not cancelled) and revenue per day. */
    private function dailyRows(int $storeId, Carbon $from, Carbon $to)
    {
        return Order::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total_amount) as gross_revenue')
            )
            ->where('store_id', $storeId)
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('date')
            ->orderBy('date')
            ->get();
    }

    public function export(Request $request)
    {
        $store = $request->attributes->get('seller_store');
        [$from, $to] = $this->parseDateRange($request);
        $format = $request->get('format', 'csv');

        $rows = $this->dailyRows($store->id, $from, $to)->map(fn ($r) => [
            'date'   => Carbon::parse($r->date)->format('M d, Y'),
            'orders' => (int) $r->orders_count,
            'gross'  => (float) $r->gross_revenue,
        ])->values()->all();

        $totalGross  = collect($rows)->sum('gross');
        $totalOrders = collect($rows)->sum('orders');
        $filename = $this->exportFilename('revenue_report', $store->store_name, $from->toDateString(), $to->toDateString(), $format);

        if ($format === 'pdf') {
            $columns = [
                ['key' => 'date',      'label' => 'Date'],
                ['key' => 'orders',    'label' => 'Orders'],
                ['key' => 'gross_fmt', 'label' => 'Revenue', 'align' => 'right'],
            ];
            $pdfRows = array_map(fn ($r) => array_merge($r, ['gross_fmt' => $this->peso($r['gross'])]), $rows);
            return $this->pdfResponse($filename, [
                'title'        => 'Revenue Report',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $from->format('M d, Y') . ' – ' . $to->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Revenue',      'value' => $this->peso($totalGross)],
                    ['label' => 'Total Orders', 'value' => $totalOrders],
                ],
                'columns'      => $columns,
                'rows'         => $pdfRows,
                'totalsRow'    => ['date' => 'TOTAL', 'orders' => $totalOrders, 'gross_fmt' => $this->peso($totalGross)],
            ]);
        }

        $headings  = ['Date', 'Orders', 'Revenue'];
        $csvRows   = array_map(fn ($r) => [$r['date'], $r['orders'], number_format($r['gross'], 2)], $rows);
        $csvRows[] = ['TOTAL', $totalOrders, number_format($totalGross, 2)];
        return $this->csvResponse($filename, $headings, $csvRows);
    }
}
