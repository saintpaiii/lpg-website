<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Invoice;
use App\Models\Setting;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceController extends Controller
{
    use GeneratesExport;

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function formatInvoice(Invoice $inv): array
    {
        $total      = (float) $inv->total_amount;
        $paid       = (float) $inv->paid_amount;
        $balance    = max(0, $total - $paid);
        $commission = (float) $inv->platform_commission;
        $netAmount  = max(0, $total - $commission);

        return [
            'id'                  => $inv->id,
            'invoice_number'      => $inv->invoice_number,
            'payment_status'      => $inv->payment_status,
            'total_amount'        => $total,
            'paid_amount'         => $paid,
            'balance'             => $balance,
            'platform_commission' => $commission,
            'net_amount'          => $netAmount,
            'payment_method' => $inv->payment_method,
            'paid_at'        => $inv->paid_at?->format('M d, Y g:i A'),
            'due_date'       => $inv->due_date?->format('M d, Y'),
            'created_at'     => $inv->created_at->format('M d, Y g:i A'),
            'deleted_at'     => $inv->deleted_at?->format('M d, Y g:i A'),
            'customer' => $inv->customer ? [
                'id'      => $inv->customer->id,
                'name'    => $inv->customer->name,
                'phone'   => $inv->customer->phone,
                'email'   => $inv->customer->email,
                'address' => $inv->customer->address,
                'barangay'=> $inv->customer->barangay,
                'city'    => $inv->customer->city,
            ] : null,
            'order' => $inv->order ? [
                'id'               => $inv->order->id,
                'order_number'     => $inv->order->order_number,
                'status'           => $inv->order->status,
                'transaction_type' => $inv->order->transaction_type,
                'payment_method'   => $inv->order->payment_method,
                'payment_status'   => $inv->order->payment_status,
                'notes'            => $inv->order->notes,
                'ordered_at'       => $inv->order->ordered_at?->format('M d, Y g:i A'),
                'delivered_at'     => $inv->order->delivered_at?->format('M d, Y g:i A'),
                'items' => $inv->order->items->map(fn ($item) => [
                    'id'         => $item->id,
                    'quantity'   => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal'   => (float) $item->subtotal,
                    'product'    => $item->product ? [
                        'id'    => $item->product->id,
                        'name'  => $item->product->name,
                        'brand' => $item->product->brand,
                    ] : null,
                ])->values()->all(),
            ] : null,
        ];
    }

    // ── Index (read-only, platform monitoring) ───────────────────────────────

    public function index(Request $request): Response
    {
        $query = Invoice::with(['customer', 'order']);

        if ($payStatus = $request->input('payment_status')) {
            $query->where('payment_status', $payStatus);
        }

        if ($dateFrom = $request->input('date_from')) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->input('date_to')) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"))
                  ->orWhereHas('order', fn ($oq) => $oq->where('order_number', 'like', "%{$search}%"));
            });
        }

        $invoices = $query
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($inv) => $this->formatInvoice($inv));

        $raw = Invoice::selectRaw("
            COUNT(*) as total_count,
            SUM(total_amount) as total_billed,
            SUM(paid_amount) as total_collected,
            SUM(total_amount - paid_amount) as total_outstanding
        ")->first();

        $summary = [
            'total_count'       => (int) ($raw->total_count ?? 0),
            'total_billed'      => (float) ($raw->total_billed ?? 0),
            'total_collected'   => (float) ($raw->total_collected ?? 0),
            'total_outstanding' => (float) ($raw->total_outstanding ?? 0),
        ];

        return Inertia::render('admin/invoices', [
            'invoices' => $invoices,
            'summary'  => $summary,
            'filters'  => $request->only('payment_status', 'date_from', 'date_to', 'search'),
        ]);
    }

    // ── Export ───────────────────────────────────────────────────────────────

    public function export(Request $request)
    {
        $format = $request->get('format', 'csv');

        $query = Invoice::with(['customer', 'order']);

        if ($payStatus = $request->input('payment_status')) {
            $query->where('payment_status', $payStatus);
        }
        if ($df = $request->input('date_from')) {
            $query->whereDate('created_at', '>=', $df);
        }
        if ($dt = $request->input('date_to')) {
            $query->whereDate('created_at', '<=', $dt);
        }
        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"))
                  ->orWhereHas('order', fn ($oq) => $oq->where('order_number', 'like', "%{$search}%"));
            });
        }

        $invoices = $query->latest()->get();

        $from = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to   = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('platform_invoices', 'LPG_Portal', $from, $to, $format);

        $columns = [
            ['key' => 'invoice_number', 'label' => 'Invoice #',     'class' => 'mono'],
            ['key' => 'order_number',   'label' => 'Order #',       'class' => 'mono'],
            ['key' => 'store_name',     'label' => 'Store'],
            ['key' => 'customer',       'label' => 'Customer'],
            ['key' => 'created_at',     'label' => 'Date'],
            ['key' => 'total_amount',   'label' => 'Total',         'align' => 'right'],
            ['key' => 'paid_amount',    'label' => 'Paid',          'align' => 'right'],
            ['key' => 'outstanding',    'label' => 'Outstanding',   'align' => 'right'],
            ['key' => 'commission',     'label' => 'Commission',    'align' => 'right'],
            ['key' => 'status',         'label' => 'Status'],
            ['key' => 'method',         'label' => 'Method'],
        ];

        $rows = $invoices->map(fn ($i) => [
            'invoice_number' => $i->invoice_number,
            'order_number'   => $i->order?->order_number ?? '—',
            'store_name'     => $i->order?->store?->store_name ?? '—',
            'customer'       => $i->customer?->name ?? '—',
            'created_at'     => $i->created_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'total_amount'   => $this->peso((float) $i->total_amount),
            'paid_amount'    => $this->peso((float) $i->paid_amount),
            'outstanding'    => $this->peso(max(0, (float) $i->total_amount - (float) $i->paid_amount)),
            'commission'     => $this->peso((float) ($i->platform_commission ?? 0)),
            'status'         => $i->payment_status,
            'method'         => $i->payment_method ?? '—',
            '_total'         => (float) $i->total_amount,
            '_paid'          => (float) $i->paid_amount,
            '_comm'          => (float) ($i->platform_commission ?? 0),
        ])->values()->all();

        $grandTotal = collect($rows)->sum('_total');
        $grandPaid  = collect($rows)->sum('_paid');
        $grandComm  = collect($rows)->sum('_comm');
        $grandOut   = max(0, $grandTotal - $grandPaid);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Platform Invoices Export',
                'orgName'      => 'LPG Portal — Platform Admin',
                'orgSub'       => 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Total Invoices',  'value' => count($rows)],
                    ['label' => 'Total Billed',    'value' => $this->peso($grandTotal)],
                    ['label' => 'Total Collected', 'value' => $this->peso($grandPaid)],
                    ['label' => 'Outstanding',     'value' => $this->peso($grandOut)],
                    ['label' => 'Commission',      'value' => $this->peso($grandComm)],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => ['invoice_number' => 'TOTAL', 'order_number' => '', 'store_name' => '', 'customer' => '', 'created_at' => '', 'total_amount' => $this->peso($grandTotal), 'paid_amount' => $this->peso($grandPaid), 'outstanding' => $this->peso($grandOut), 'commission' => $this->peso($grandComm), 'status' => '', 'method' => ''],
            ]);
        }

        $headings = ['Invoice #', 'Order #', 'Store', 'Customer', 'Date', 'Total', 'Paid', 'Outstanding', 'Commission', 'Status', 'Method'];
        $csvRows  = array_map(fn ($r) => [$r['invoice_number'], $r['order_number'], $r['store_name'], $r['customer'], $r['created_at'], $r['total_amount'], $r['paid_amount'], $r['outstanding'], $r['commission'], $r['status'], $r['method']], $rows);
        $csvRows[] = ['TOTAL', '', '', '', '', $this->peso($grandTotal), $this->peso($grandPaid), $this->peso($grandOut), $this->peso($grandComm), '', ''];
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(Request $request, Invoice $invoice): Response
    {
        $invoice->load(['customer', 'order.items.product']);

        $company = [
            'name'    => Setting::get('company_name', 'LPG Distributor'),
            'address' => Setting::get('company_address', 'Cavite, Philippines'),
            'phone'   => Setting::get('company_phone', ''),
            'email'   => Setting::get('company_email', ''),
        ];

        return Inertia::render('admin/invoice-show', [
            'invoice' => $this->formatInvoice($invoice),
            'company' => $company,
        ]);
    }

}
