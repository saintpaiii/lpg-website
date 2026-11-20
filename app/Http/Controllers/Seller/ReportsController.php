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
            'orders'    => (int) $r->orders_count,
            'delivered' => (int) $r->delivered_count,
            'gross'     => (float) $r->gross_revenue,
        ])->values()->all();

        // K11: AOV = revenue ÷ delivered-and-paid orders — both from RevenueService, the Store Dashboard's definition
        $sum = \App\Services\RevenueService::summary($store->id, $from, $to);

        return Inertia::render('seller/reports', [
            'date_from' => $from->toDateString(),
            'date_to'   => $to->toDateString(),
            'summary' => [
                'gross_revenue'       => $sum['sales'],
                'total_orders'        => collect($chart)->sum('orders'),
                'delivered_orders'    => $sum['orders'],
                'average_order_value' => $sum['orders'] > 0 ? round($sum['sales'] / $sum['orders'], 2) : 0,
            ],
            'chart' => $chart,
        ]);
    }

    /**
     * Per day: orders placed (not cancelled, by order date) and SALES — K9: RevenueService (delivered + paid, items +
     * delivery fee, by delivery date), the same number as the Dashboard, Revenue and the Main dashboard.
     */
    private function dailyRows(int $storeId, Carbon $from, Carbon $to)
    {
        $orders = Order::select(DB::raw('DATE(created_at) as date'), DB::raw('COUNT(*) as orders_count'))
            ->where('store_id', $storeId)
            ->whereNotIn('status', ['cancelled'])
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('date')
            ->pluck('orders_count', 'date');
        $sales = \App\Services\RevenueService::dailyFor($storeId, $from, $to);
        $dates = collect(array_keys($sales))->merge($orders->keys()->map(fn ($d) => substr((string) $d, 0, 10)))->unique()->sort()->values();

        return $dates->map(fn ($d) => (object) [
            'date'            => $d,
            'orders_count'    => (int) ($orders[$d] ?? 0),
            'delivered_count' => (int) ($sales[$d]['orders'] ?? 0),
            'gross_revenue'   => (float) ($sales[$d]['sales'] ?? 0),
        ]);
    }

    public function export(Request $request)
    {
        $store = $request->attributes->get('seller_store');
        [$from, $to] = $this->parseDateRange($request);
        $format = $request->get('format', 'csv');

        $rows = $this->dailyRows($store->id, $from, $to)->map(fn ($r) => [
            'date'   => Carbon::parse($r->date)->format('M d, Y'),
            'orders'    => (int) $r->orders_count,
            'delivered' => (int) $r->delivered_count,
            'gross'     => (float) $r->gross_revenue,
        ])->values()->all();

        $totalGross     = collect($rows)->sum('gross');
        $totalOrders    = collect($rows)->sum('orders');
        $totalDelivered = collect($rows)->sum('delivered');
        $aov            = $totalDelivered > 0 ? round($totalGross / $totalDelivered, 2) : 0;
        $filename = $this->exportFilename('revenue_report', $store->store_name, $from->toDateString(), $to->toDateString(), $format);

        if ($format === 'pdf') {
            $columns = [
                ['key' => 'date',      'label' => 'Date'],
                ['key' => 'orders',    'label' => 'Orders placed'],
                ['key' => 'delivered', 'label' => 'Delivered & paid'],
                ['key' => 'gross_fmt', 'label' => 'Revenue', 'align' => 'right'],
            ];
            $pdfRows = array_map(fn ($r) => array_merge($r, ['gross_fmt' => $this->peso($r['gross'])]), $rows);
            return $this->pdfResponse($filename, [
                'title'        => 'Revenue Report',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $from->format('M d, Y') . ' – ' . $to->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Revenue (delivered + paid)', 'value' => $this->peso($totalGross)],
                    ['label' => 'Delivered & paid orders',    'value' => $totalDelivered],
                    ['label' => 'Average order value',        'value' => $this->peso($aov)],
                    ['label' => 'Orders placed',              'value' => $totalOrders],
                ],
                'columns'      => $columns,
                'rows'         => $pdfRows,
                'totalsRow'    => ['date' => 'TOTAL', 'orders' => $totalOrders, 'delivered' => $totalDelivered, 'gross_fmt' => $this->peso($totalGross)],
            ]);
        }

        $headings  = ['Date', 'Orders placed', 'Delivered & paid', 'Revenue'];
        $csvRows   = array_map(fn ($r) => [$r['date'], $r['orders'], $r['delivered'], number_format($r['gross'], 2)], $rows);
        $csvRows[] = ['TOTAL', $totalOrders, $totalDelivered, number_format($totalGross, 2)];
        return $this->csvResponse($filename, $headings, $csvRows);
    }
}
