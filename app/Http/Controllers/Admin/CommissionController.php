<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Concerns\PresentsCommissionInvoices;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\CommissionInvoice;
use App\Models\Store;
use App\Services\CommissionBillingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Platform commission billing — sellers are invoiced periodically for the
 * commissions recorded on their delivered + paid orders.
 */
class CommissionController extends Controller
{
    use GeneratesExport, PresentsCommissionInvoices;

    private function filteredQuery(Request $request, bool $applyTab = true)
    {
        $query = CommissionInvoice::with('store');

        $tab = $request->get('tab', 'all');
        if ($applyTab && in_array($tab, ['pending', 'paid', 'overdue', 'waived'])) {
            $query->where('status', $tab);
        }
        if ($id = $request->get('store_id'))  $query->where('store_id', $id);
        if ($df = $request->get('date_from')) $query->whereDate('period_end', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('period_start', '<=', $dt);
        if ($q = $request->get('search')) {
            $query->where(fn ($w) => $w->where('invoice_number', 'like', "%{$q}%")
                ->orWhereHas('store', fn ($s) => $s->where('store_name', 'like', "%{$q}%")));
        }

        return $query->orderByDesc('created_at');
    }

    public function index(Request $request): Response
    {
        CommissionBillingService::markOverdue();

        $summary = [
            'total_owed'         => (float) CommissionInvoice::whereIn('status', ['pending', 'overdue'])->sum('commission_amount'),
            'total_collected'    => (float) CommissionInvoice::where('status', 'paid')->sum('commission_amount'),
            'total_overdue'      => (float) CommissionInvoice::where('status', 'overdue')->sum('commission_amount'),
            'overdue_count'      => CommissionInvoice::where('status', 'overdue')->count(),
            'uninvoiced_amount'  => (float) Commission::where('status', 'pending')->sum('commission_amount'),
            'uninvoiced_orders'  => Commission::where('status', 'pending')->count(),
            'suspended_stores'   => Store::where('commission_suspended', true)->count(),
        ];

        $base   = $this->filteredQuery($request, false);
        $counts = [
            'all'     => (clone $base)->count(),
            'pending' => (clone $base)->where('status', 'pending')->count(),
            'paid'    => (clone $base)->where('status', 'paid')->count(),
            'overdue' => (clone $base)->where('status', 'overdue')->count(),
            'waived'  => (clone $base)->where('status', 'waived')->count(),
        ];

        return Inertia::render('admin/commissions', [
            'summary'  => $summary,
            'counts'   => $counts,
            'invoices' => $this->filteredQuery($request)->paginate(20)->withQueryString()
                ->through(fn (CommissionInvoice $i) => $this->formatInvoice($i)),
            'stores'   => Store::orderBy('store_name')->get(['id', 'store_name']),
            'filters'  => $request->only('tab', 'store_id', 'date_from', 'date_to', 'search') + ['tab' => $request->get('tab', 'all')],
            'billing'  => [
                'period'        => CommissionBillingService::billingPeriod(),
                'due_days'      => CommissionBillingService::dueDays(),
                'suspend_after' => CommissionBillingService::suspendAfterDays(),
            ],
        ]);
    }

    public function show(CommissionInvoice $invoice): Response
    {
        CommissionBillingService::markOverdue();
        $invoice->refresh()->load('store');

        return Inertia::render('admin/commission-invoice-show', [
            'invoice' => $this->formatInvoice($invoice),
            'lines'   => $this->invoiceLines($invoice),
        ]);
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function resolvePeriod(Request $request): array
    {
        $data = $request->validate([
            'period'    => 'required|in:this_week,this_month,last_week,last_month,custom',
            'date_from' => 'required_if:period,custom|nullable|date',
            'date_to'   => 'required_if:period,custom|nullable|date|after_or_equal:date_from',
        ]);

        return match ($data['period']) {
            'this_week'  => CommissionBillingService::periodFor('weekly', now()),
            'this_month' => CommissionBillingService::periodFor('monthly', now()),
            'last_week'  => CommissionBillingService::periodFor('weekly', now()->subWeek()),
            'last_month' => CommissionBillingService::periodFor('monthly', now()->startOfMonth()->subDay()),
            'custom'     => [Carbon::parse($data['date_from']), Carbon::parse($data['date_to'])],
        };
    }

    /** Live preview for the Generate Invoices dialog. */
    public function preview(Request $request): JsonResponse
    {
        [$start, $end] = $this->resolvePeriod($request);

        return response()->json(CommissionBillingService::preview($start, $end) + [
            'range' => $start->format('M d') . ' – ' . $end->format('M d, Y'),
        ]);
    }

    public function generate(Request $request): RedirectResponse
    {
        [$start, $end] = $this->resolvePeriod($request);

        $invoices = CommissionBillingService::generate($start, $end);
        $range    = $start->format('M d') . ' – ' . $end->format('M d, Y');

        if (empty($invoices)) {
            return back()->with('error', "No uninvoiced commissions found for {$range}.");
        }

        $total = array_sum(array_map(fn ($i) => (float) $i->commission_amount, $invoices));

        return back()->with('success', sprintf(
            'Generated %d invoice(s) for %s totaling ₱%s. Sellers have been notified.',
            count($invoices), $range, number_format($total, 2)
        ));
    }

    public function markPaid(Request $request, CommissionInvoice $invoice): RedirectResponse
    {
        if (! $invoice->isUnpaid()) {
            return back()->with('error', 'Only unpaid invoices can be marked as paid.');
        }

        $data = $request->validate([
            'payment_method'    => 'required|in:bank_transfer,gcash,paymongo,cash',
            'payment_reference' => 'required|string|max:255',
            'notes'             => 'nullable|string|max:1000',
        ]);

        if (! empty($data['notes'])) {
            $invoice->update(['notes' => $data['notes']]);
        }

        CommissionBillingService::markPaid($invoice, $data['payment_method'], $data['payment_reference'], byAdmin: true);

        return back()->with('success', "Invoice {$invoice->invoice_number} marked as paid.");
    }

    public function waive(Request $request, CommissionInvoice $invoice): RedirectResponse
    {
        if (! $invoice->isUnpaid()) {
            return back()->with('error', 'Only unpaid invoices can be waived.');
        }

        $data = $request->validate(['notes' => 'required|string|max:1000']);

        CommissionBillingService::waive($invoice, $data['notes']);

        return back()->with('success', "Invoice {$invoice->invoice_number} waived.");
    }

    public function remind(CommissionInvoice $invoice): RedirectResponse
    {
        if (! $invoice->isUnpaid()) {
            return back()->with('error', 'This invoice is already settled.');
        }

        $amount = '₱' . number_format((float) $invoice->commission_amount, 2);
        $msg = $invoice->status === 'overdue'
            ? "OVERDUE: commission invoice {$invoice->invoice_number} ({$amount}) was due on {$invoice->due_date->format('M d, Y')}. Please pay immediately to avoid store suspension."
            : "Reminder: commission invoice {$invoice->invoice_number} ({$amount}) is due on {$invoice->due_date->format('M d, Y')}.";

        CommissionBillingService::notifySeller($invoice, 'Commission Payment Reminder', $msg);

        return back()->with('success', "Reminder sent to {$invoice->store?->store_name}.");
    }

    public function pdf(CommissionInvoice $invoice)
    {
        return $this->invoicePdf($invoice->load('store'));
    }

    public function export(Request $request)
    {
        $format = $request->get('format', 'csv');
        $rows   = $this->filteredQuery($request)->get();

        $from     = $request->get('date_from') ?: ($rows->min('period_start')?->toDateString() ?? now()->startOfMonth()->toDateString());
        $to       = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('commission_invoices', 'LPG_Portal', $from, $to, $format);

        $data = $rows->map(fn (CommissionInvoice $i) => [
            'invoice'    => $i->invoice_number,
            'store'      => $i->store?->store_name ?? '—',
            'period'     => $i->periodLabel(),
            'orders'     => $i->total_orders,
            'sales'      => $this->peso((float) $i->total_sales),
            'commission' => $this->peso((float) $i->commission_amount),
            'status'     => ucfirst($i->status),
            'due'        => $i->due_date->format('M d, Y'),
            'paid'       => $i->paid_at?->format('M d, Y') ?? '—',
            'reference'  => $i->payment_reference ?? '—',
        ])->values()->all();

        $sumSales = $rows->sum(fn ($i) => (float) $i->total_sales);
        $sumComm  = $rows->sum(fn ($i) => (float) $i->commission_amount);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Commission Invoices',
                'orgName'      => 'LPG Portal',
                'orgSub'       => 'Cavite, Philippines',
                'dateRange'    => Carbon::parse($from)->format('M d, Y') . ' – ' . Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Invoices',   'value' => count($data)],
                    ['label' => 'Sales',      'value' => $this->peso($sumSales)],
                    ['label' => 'Commission', 'value' => $this->peso($sumComm)],
                    ['label' => 'Collected',  'value' => $this->peso($rows->where('status', 'paid')->sum(fn ($i) => (float) $i->commission_amount))],
                ],
                'columns' => [
                    ['key' => 'invoice',    'label' => 'Invoice #', 'class' => 'mono'],
                    ['key' => 'store',      'label' => 'Store'],
                    ['key' => 'period',     'label' => 'Period'],
                    ['key' => 'orders',     'label' => 'Orders', 'align' => 'right'],
                    ['key' => 'sales',      'label' => 'Sales', 'align' => 'right'],
                    ['key' => 'commission', 'label' => 'Commission', 'align' => 'right'],
                    ['key' => 'status',     'label' => 'Status'],
                    ['key' => 'due',        'label' => 'Due'],
                    ['key' => 'paid',       'label' => 'Paid'],
                    ['key' => 'reference',  'label' => 'Reference'],
                ],
                'rows'      => $data,
                'totalsRow' => ['invoice' => 'TOTAL', 'store' => '', 'period' => '', 'orders' => $rows->sum('total_orders'),
                    'sales' => $this->peso($sumSales), 'commission' => $this->peso($sumComm), 'status' => '', 'due' => '', 'paid' => '', 'reference' => ''],
            ]);
        }

        $csv   = array_map(fn ($r) => array_values($r), $data);
        $csv[] = ['TOTAL', '', '', $rows->sum('total_orders'), $this->peso($sumSales), $this->peso($sumComm), '', '', '', ''];

        return $this->csvResponse($filename, ['Invoice #', 'Store', 'Period', 'Orders', 'Sales', 'Commission', 'Status', 'Due Date', 'Paid At', 'Reference'], $csv);
    }
}
