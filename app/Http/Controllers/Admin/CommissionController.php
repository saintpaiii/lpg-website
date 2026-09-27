<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Store;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Platform commission tracking (replaces seller withdrawals).
 * One commission row is created per delivered + paid order.
 */
class CommissionController extends Controller
{
    use GeneratesExport;

    private function filteredQuery(Request $request)
    {
        $query = Commission::with(['order', 'store']);

        if ($s = $request->get('status'))    $query->where('status', $s);
        if ($id = $request->get('store_id')) $query->where('store_id', $id);
        if ($df = $request->get('date_from')) $query->whereDate('created_at', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('created_at', '<=', $dt);
        if ($q = $request->get('search')) {
            $query->whereHas('order', fn ($o) => $o->withTrashed()->where('order_number', 'like', "%{$q}%"));
        }

        return $query->orderByDesc('created_at');
    }

    public function index(Request $request): Response
    {
        $valid = Commission::where('status', '!=', 'failed');

        $summary = [
            'total_earned'     => (float) (clone $valid)->sum('commission_amount'),
            'collected'        => (float) Commission::where('status', 'collected')->sum('commission_amount'),
            'pending'          => (float) Commission::where('status', 'pending')->sum('commission_amount'),
            'this_month'       => (float) (clone $valid)
                ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->sum('commission_amount'),
            'gross_sales'      => (float) (clone $valid)->sum('order_total'),
            'orders'           => (clone $valid)->count(),
        ];

        $byStore = Commission::query()
            ->select('store_id',
                DB::raw('COUNT(*) as orders'),
                DB::raw("SUM(CASE WHEN status != 'failed' THEN order_total ELSE 0 END) as gross_sales"),
                DB::raw("SUM(CASE WHEN status != 'failed' THEN commission_amount ELSE 0 END) as commission_total"),
                DB::raw("SUM(CASE WHEN status = 'collected' THEN commission_amount ELSE 0 END) as collected"),
                DB::raw("SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END) as pending"))
            ->groupBy('store_id')
            ->orderByDesc('commission_total')
            ->with('store')
            ->get()
            ->map(fn ($row) => [
                'store_id'         => $row->store_id,
                'store_name'       => $row->store?->store_name ?? '—',
                'orders'           => (int) $row->orders,
                'gross_sales'      => (float) $row->gross_sales,
                'commission_total' => (float) $row->commission_total,
                'collected'        => (float) $row->collected,
                'pending'          => (float) $row->pending,
            ])->values()->all();

        $commissions = $this->filteredQuery($request)
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Commission $c) => [
                'id'                => $c->id,
                'order_number'      => $c->order?->order_number,
                'payment_mode'      => $c->order?->payment_mode,
                'store_name'        => $c->store?->store_name,
                'order_total'       => (float) $c->order_total,
                'commission_rate'   => (float) $c->commission_rate,
                'commission_amount' => (float) $c->commission_amount,
                'seller_amount'     => (float) $c->seller_amount,
                'status'            => $c->status,
                'collected_at'      => $c->collected_at?->format('M d, Y'),
                'created_at'        => $c->created_at->format('M d, Y g:i A'),
            ]);

        return Inertia::render('admin/commissions', [
            'summary'     => $summary,
            'by_store'    => $byStore,
            'commissions' => $commissions,
            'stores'      => Store::orderBy('store_name')->get(['id', 'store_name']),
            'filters'     => $request->only('status', 'store_id', 'date_from', 'date_to', 'search'),
        ]);
    }

    public function updateStatus(Request $request, Commission $commission): RedirectResponse
    {
        $data = $request->validate([
            'status' => 'required|in:pending,collected,failed',
        ]);

        $commission->update([
            'status'       => $data['status'],
            'collected_at' => $data['status'] === 'collected' ? ($commission->collected_at ?? now()) : null,
        ]);

        return back()->with('success', 'Commission marked as ' . $data['status'] . '.');
    }

    public function export(Request $request)
    {
        $format = $request->get('format', 'csv');
        $rows   = $this->filteredQuery($request)->get();

        $from     = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to       = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('commissions', 'LPG_Portal', $from, $to, $format);

        $data = $rows->map(fn (Commission $c) => [
            'date'       => $c->created_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'store'      => $c->store?->store_name ?? '—',
            'order'      => $c->order?->order_number ?? '—',
            'total'      => $this->peso((float) $c->order_total),
            'rate'       => number_format((float) $c->commission_rate, 2) . '%',
            'commission' => $this->peso((float) $c->commission_amount),
            'status'     => ucfirst($c->status),
        ])->values()->all();

        $sumTotal = $rows->sum(fn ($c) => (float) $c->order_total);
        $sumComm  = $rows->sum(fn ($c) => (float) $c->commission_amount);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Platform Commissions',
                'orgName'      => 'LPG Portal',
                'orgSub'       => 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Orders',      'value' => count($data)],
                    ['label' => 'Gross Sales', 'value' => $this->peso($sumTotal)],
                    ['label' => 'Commission',  'value' => $this->peso($sumComm)],
                ],
                'columns' => [
                    ['key' => 'date',       'label' => 'Date'],
                    ['key' => 'store',      'label' => 'Store'],
                    ['key' => 'order',      'label' => 'Order #', 'class' => 'mono'],
                    ['key' => 'total',      'label' => 'Order Total', 'align' => 'right'],
                    ['key' => 'rate',       'label' => 'Rate', 'align' => 'right'],
                    ['key' => 'commission', 'label' => 'Commission', 'align' => 'right'],
                    ['key' => 'status',     'label' => 'Status'],
                ],
                'rows'      => $data,
                'totalsRow' => ['date' => 'TOTAL', 'store' => '', 'order' => '', 'total' => $this->peso($sumTotal), 'rate' => '', 'commission' => $this->peso($sumComm), 'status' => ''],
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', '', $this->peso($sumTotal), '', $this->peso($sumComm), ''];

        return $this->csvResponse($filename, ['Date', 'Store', 'Order #', 'Order Total', 'Rate', 'Commission', 'Status'], $csv);
    }
}
