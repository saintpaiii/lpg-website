<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Seller revenue overview. Replaces the old wallet: the platform no longer holds
 * seller funds, so this page only reports sales and the commission owed per order.
 */
class RevenueController extends Controller
{
    use GeneratesExport;

    private function filteredQuery(Request $request, int $storeId)
    {
        $query = Commission::with('order')->where('store_id', $storeId);

        if ($df = $request->get('date_from')) $query->whereDate('created_at', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('created_at', '<=', $dt);
        if ($st = $request->get('status'))    $query->where('status', $st);

        return $query->orderByDesc('created_at');
    }

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        $base = Commission::where('store_id', $store->id)->where('status', '!=', 'failed');

        $totalRevenue   = (float) (clone $base)->sum('order_total');
        $monthRevenue   = (float) (clone $base)
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->sum('order_total');
        $commissionPaid = (float) Commission::where('store_id', $store->id)->where('status', 'collected')->sum('commission_amount');
        $commissionDue  = (float) Commission::where('store_id', $store->id)->whereIn('status', ['pending', 'invoiced'])->sum('commission_amount');
        $netRevenue     = (float) (clone $base)->sum('seller_amount');

        $commissions = $this->filteredQuery($request, $store->id)
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Commission $c) => [
                'id'                => $c->id,
                'order_id'          => $c->order_id,
                'order_number'      => $c->order?->order_number,
                'payment_mode'      => $c->order?->payment_mode,
                'order_total'       => (float) $c->order_total,
                'commission_rate'   => (float) $c->commission_rate,
                'commission_amount' => (float) $c->commission_amount,
                'seller_amount'     => (float) $c->seller_amount,
                'status'            => $c->status,
                'collected_at'      => $c->collected_at?->format('M d, Y'),
                'created_at'        => $c->created_at->format('M d, Y g:i A'),
            ]);

        return Inertia::render('seller/revenue', [
            'summary' => [
                'total_revenue'   => $totalRevenue,
                'month_revenue'   => $monthRevenue,
                'commission_paid' => $commissionPaid,
                'commission_due'  => $commissionDue,
                'net_revenue'     => $netRevenue,
                'commission_rate' => (float) ($store->commission_rate ?: Commission::DEFAULT_RATE),
            ],
            'commissions' => $commissions,
            'filters'     => $request->only('date_from', 'date_to', 'status'),
        ]);
    }

    public function export(Request $request)
    {
        $store  = $request->attributes->get('seller_store');
        $format = $request->get('format', 'csv');
        $rows   = $this->filteredQuery($request, $store->id)->get();

        $from     = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to       = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('revenue', $store->store_name, $from, $to, $format);

        $data = $rows->map(fn (Commission $c) => [
            'date'       => $c->created_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'order'      => $c->order?->order_number ?? '—',
            'total'      => $this->peso((float) $c->order_total),
            'rate'       => number_format((float) $c->commission_rate, 2) . '%',
            'commission' => $this->peso((float) $c->commission_amount),
            'net'        => $this->peso((float) $c->seller_amount),
            'status'     => ucfirst($c->status),
        ])->values()->all();

        $sumTotal = $rows->sum(fn ($c) => (float) $c->order_total);
        $sumComm  = $rows->sum(fn ($c) => (float) $c->commission_amount);
        $sumNet   = $rows->sum(fn ($c) => (float) $c->seller_amount);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Revenue & Commission Report',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Gross Revenue', 'value' => $this->peso($sumTotal)],
                    ['label' => 'Commission',    'value' => $this->peso($sumComm)],
                    ['label' => 'Net Revenue',   'value' => $this->peso($sumNet)],
                ],
                'columns' => [
                    ['key' => 'date',       'label' => 'Date'],
                    ['key' => 'order',      'label' => 'Order #', 'class' => 'mono'],
                    ['key' => 'total',      'label' => 'Order Total', 'align' => 'right'],
                    ['key' => 'rate',       'label' => 'Rate', 'align' => 'right'],
                    ['key' => 'commission', 'label' => 'Commission', 'align' => 'right'],
                    ['key' => 'net',        'label' => 'Net', 'align' => 'right'],
                    ['key' => 'status',     'label' => 'Status'],
                ],
                'rows'      => $data,
                'totalsRow' => ['date' => 'TOTAL', 'order' => '', 'total' => $this->peso($sumTotal), 'rate' => '', 'commission' => $this->peso($sumComm), 'net' => $this->peso($sumNet), 'status' => ''],
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', $this->peso($sumTotal), '', $this->peso($sumComm), $this->peso($sumNet), ''];

        return $this->csvResponse($filename, ['Date', 'Order #', 'Order Total', 'Rate', 'Commission', 'Net', 'Status'], $csv);
    }
}
