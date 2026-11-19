<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\StockTransfer;
use App\Services\MainDashboardService;
use App\Services\StockTransferService;
use App\Support\StoreContext;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * J9 — the owner's MAIN dashboard (all approved stores: totals, comparison, charts, DSS notes, all transfers).
 * Owner only, and the MAIN store must be on a paid Premium plan (plan.feature:branches).
 */
class MainDashboardController extends Controller
{
    use GeneratesExport;

    public function index(Request $request): Response
    {
        $owner = $request->user();
        [$from, $to, $key] = MainDashboardService::period((string) $request->query('period', '30d'), $request->query('from'), $request->query('to'));

        return Inertia::render('seller/main-dashboard', [
            'period'    => ['key' => $key, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'options' => MainDashboardService::PERIODS],
            'dashboard' => MainDashboardService::build($owner, $from, $to),
            'transfers' => StockTransferService::rows(StockTransfer::where('owner_id', $owner->id), $owner),
            'activeStoreId' => StoreContext::for($owner, $request)?->id,
            'rules'     => [
                'cancel_rate' => MainDashboardService::CANCEL_RATE, 'slow_factor' => MainDashboardService::SLOW_FACTOR,
                'plan_days' => MainDashboardService::PLAN_DAYS, 'min_orders' => MainDashboardService::MIN_ORDERS,
            ],
        ]);
    }

    /** GET seller/main-dashboard/export?format=csv|pdf — the comparison table. */
    public function export(Request $request)
    {
        $owner = $request->user();
        [$from, $to] = MainDashboardService::period((string) $request->query('period', '30d'), $request->query('from'), $request->query('to'));
        $d = MainDashboardService::build($owner, $from, $to);
        $format = $request->query('format') === 'pdf' ? 'pdf' : 'csv';
        $main = StoreContext::mainFor($owner);
        $filename = $this->exportFilename('branch-comparison', (string) $main?->store_name, $from->toDateString(), $to->toDateString(), $format);

        $columns = [
            ['key' => 'name', 'label' => 'Store'], ['key' => 'sales', 'label' => 'Sales', 'align' => 'right'],
            ['key' => 'orders', 'label' => 'Orders', 'align' => 'right'], ['key' => 'aov', 'label' => 'Avg order', 'align' => 'right'],
            ['key' => 'cancel_rate', 'label' => 'Cancel %', 'align' => 'right'], ['key' => 'delivery_min', 'label' => 'Avg delivery', 'align' => 'right'],
            ['key' => 'rating', 'label' => 'Rating', 'align' => 'right'], ['key' => 'stock_value', 'label' => 'Stock value', 'align' => 'right'],
            ['key' => 'plan', 'label' => 'Plan'], ['key' => 'alerts', 'label' => 'Alerts', 'align' => 'right'],
        ];
        $rows = array_map(fn ($r) => [
            'name' => $r['name'], 'sales' => $this->peso($r['sales']), 'orders' => $r['orders'], 'aov' => $this->peso($r['aov']),
            'cancel_rate' => $r['cancel_rate'] . '%', 'delivery_min' => $r['delivery_min'] !== null ? $r['delivery_min'] . ' min' : '—',
            'rating' => $r['rating'] ?? '—', 'stock_value' => $this->peso($r['stock_value']),
            'plan' => $r['plan'] . ($r['plan_active'] ? " ({$r['days_left']}d left)" : ' (ended)'), 'alerts' => $r['alerts'],
        ], $d['rows']);
        $totals = $d['totals'] ?? ['sales' => 0, 'orders' => 0, 'stock_value' => 0];

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Branch Comparison',
                'orgName'      => (string) $main?->store_name,
                'orgSub'       => 'All stores (main + branches)',
                'dateRange'    => $from->format('M d, Y') . ' – ' . $to->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Stores', 'value' => count($rows)],
                    ['label' => 'Sales', 'value' => $this->peso((float) $totals['sales'])],
                    ['label' => 'Orders', 'value' => $totals['orders']],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => ['name' => 'TOTAL', 'sales' => $this->peso((float) $totals['sales']), 'orders' => $totals['orders'], 'aov' => '',
                    'cancel_rate' => '', 'delivery_min' => '', 'rating' => '', 'stock_value' => $this->peso((float) $totals['stock_value']), 'plan' => '', 'alerts' => ''],
            ]);
        }

        $csv = array_map(fn ($r) => array_values($r), $rows);
        $csv[] = ['TOTAL', $this->peso((float) $totals['sales']), $totals['orders'], '', '', '', '', $this->peso((float) $totals['stock_value']), '', ''];

        return $this->csvResponse($filename, array_column($columns, 'label'), $csv);
    }
}
