<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Invoice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceController extends Controller
{
    use GeneratesExport;
    public function index(Request $request): Response
    {
        $store  = request()->attributes->get('seller_store');
        $tab    = $request->input('tab', 'all');
        $search = $request->input('search');

        $query = Invoice::with(['order', 'customer'])
            ->where('store_id', $store->id);

        if ($tab === 'paid') {
            $query->where('payment_status', 'paid');
        } elseif ($tab === 'unpaid') {
            $query->where('payment_status', 'unpaid');
        } elseif ($tab === 'partial') {
            $query->where('payment_status', 'partial');
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        if ($dateFrom) $query->whereDate('created_at', '>=', $dateFrom);
        if ($dateTo)   $query->whereDate('created_at', '<=', $dateTo);

        $invoices = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($i) => [
                'id'                  => $i->id,
                'invoice_number'      => $i->invoice_number,
                'total_amount'        => (float) $i->total_amount,
                // What the customer pays the store: items + delivery fee (commission is billed separately)
                'grand_total'         => (float) $i->total_amount + (float) ($i->order?->shipping_fee ?? 0),
                'paid_amount'         => (float) $i->paid_amount,
                'payment_status'      => $i->payment_status,
                'payment_method'      => $i->payment_method,
                'due_date'            => $i->due_date?->format('M d, Y'),
                'paid_at'             => $i->paid_at?->format('M d, Y'),
                'created_at'          => $i->created_at->format('M d, Y'),
                'customer'            => $i->customer?->name ?? '—',
                'order_number'        => $i->order?->order_number ?? '—',
                'order_id'            => $i->order_id,
                'order_status'        => $i->order?->status,
            ]);

        $counts = [
            'all'     => Invoice::where('store_id', $store->id)->count(),
            'paid'    => Invoice::where('store_id', $store->id)->where('payment_status', 'paid')->count(),
            'unpaid'  => Invoice::where('store_id', $store->id)->where('payment_status', 'unpaid')->count(),
            'partial' => Invoice::where('store_id', $store->id)->where('payment_status', 'partial')->count(),
        ];

        return Inertia::render('seller/invoices', [
            'invoices' => $invoices,
            'counts'   => $counts,
            'tab'       => $tab,
            'search'    => $search ?? '',
            'date_from' => $request->get('date_from') ?: '',
            'date_to'   => $request->get('date_to')   ?: '',
        ]);
    }

    public function export(Request $request)
    {
        $store  = request()->attributes->get('seller_store');
        $tab    = $request->input('tab', 'all');
        $format = $request->get('format', 'csv');

        $query = Invoice::with(['order', 'customer'])->where('store_id', $store->id);
        if ($tab === 'paid')    $query->where('payment_status', 'paid');
        if ($tab === 'unpaid')  $query->where('payment_status', 'unpaid');
        if ($tab === 'partial') $query->where('payment_status', 'partial');
        if ($s = $request->input('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('invoice_number', 'like', "%{$s}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$s}%"));
            });
        }
        if ($df = $request->get('date_from')) $query->whereDate('created_at', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('created_at', '<=', $dt);

        $invoices = $query->latest()->get();

        $from = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to   = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('invoices', $store->store_name, $from, $to, $format);

        $columns = [
            ['key' => 'invoice_number', 'label' => 'Invoice #',    'class' => 'mono'],
            ['key' => 'order_number',   'label' => 'Order #',      'class' => 'mono'],
            ['key' => 'customer',       'label' => 'Customer'],
            ['key' => 'created_at',     'label' => 'Date'],
            ['key' => 'total_amount',   'label' => 'Total',        'align' => 'right'],
            ['key' => 'status',         'label' => 'Status'],
            ['key' => 'method',         'label' => 'Method'],
        ];

        $rows = $invoices->map(fn ($i) => [
            'invoice_number' => $i->invoice_number,
            'order_number'   => $i->order?->order_number ?? '—',
            'customer'       => $i->customer?->name ?? '—',
            'created_at'     => $i->created_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'total_amount'   => $this->peso((float) $i->total_amount + (float) ($i->order?->shipping_fee ?? 0)),
            'status'         => $i->payment_status,
            'method'         => $i->payment_method ?? '—',
            // raw for totals
            '_total'  => (float) $i->total_amount + (float) ($i->order?->shipping_fee ?? 0),
        ])->values()->all();

        $grandTotal = collect($rows)->sum('_total');

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Invoices Export',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Total Invoices', 'value' => count($rows)],
                    ['label' => 'Total',          'value' => $this->peso($grandTotal)],
                    ['label' => 'Note',           'value' => 'Platform commission is billed separately'],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => ['invoice_number' => 'TOTAL', 'order_number' => '', 'customer' => '', 'created_at' => '', 'total_amount' => $this->peso($grandTotal), 'status' => '', 'method' => ''],
            ]);
        }

        $headings = ['Invoice #', 'Order #', 'Customer', 'Date', 'Total', 'Status', 'Method'];
        $csvRows  = array_map(fn ($r) => [$r['invoice_number'], $r['order_number'], $r['customer'], $r['created_at'], $r['total_amount'], $r['status'], $r['method']], $rows);
        $csvRows[] = ['TOTAL', '', '', '', $this->peso($grandTotal), '', ''];
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    public function show(Invoice $invoice): Response
    {
        $store = request()->attributes->get('seller_store');
        if ($invoice->store_id !== $store->id) abort(403);

        $invoice->load(['order.items.product', 'order.payments', 'customer']);

        // Determine payment source (PayMongo or COD)
        $latestPayment = $invoice->order?->payments()
            ->orderByDesc('created_at')
            ->first();

        $isOnline = $latestPayment !== null;
        $payRef   = $latestPayment?->paymongo_checkout_id;
        $paidVia  = null;
        if ($isOnline && $latestPayment?->paid_at) {
            $paidVia = 'PayMongo on ' . $latestPayment->paid_at->format('M d, Y');
        }

        $shippingFee = (float) ($invoice->order?->shipping_fee ?? 0);

        return Inertia::render('seller/invoice-show', [
            'breakdown' => $invoice->order?->priceBreakdown()
                ?? ['subtotal' => (float) $invoice->total_amount, 'delivery_fee' => 0, 'store_discount' => 0, 'coupon_code' => null, 'coupon_discount' => 0, 'coupon_on_delivery' => 0, 'grand_total' => (float) $invoice->total_amount],
            'invoice' => [
                'id'                  => $invoice->id,
                'invoice_number'      => $invoice->invoice_number,
                'total_amount'        => (float) $invoice->total_amount,
                'shipping_fee'        => $shippingFee,
                'paid_amount'         => $invoice->payment_status === 'paid' && $invoice->order
                    ? max($invoice->order->grandTotal(), (float) $invoice->paid_amount)
                    : (float) $invoice->paid_amount,
                'payment_status'      => $invoice->payment_status,
                'payment_method'      => $invoice->payment_method,
                // Commission is owed to the platform and billed separately — never deducted here
                'commission'          => $this->commissionInfo($invoice),
                'due_date'            => $invoice->due_date?->format('M d, Y'),
                'paid_at'             => $invoice->paid_at?->format('M d, Y'),
                'created_at'          => $invoice->created_at->format('M d, Y g:i A'),
                'is_online'           => $isOnline,
                'pay_ref'             => $payRef,
                'paid_via'            => $paidVia,
                'customer' => $invoice->customer ? [
                    'name'    => $invoice->customer->name,
                    'phone'   => $invoice->customer->phone,
                    'address' => $invoice->customer->address,
                    'city'    => $invoice->customer->city,
                ] : null,
                'order' => $invoice->order ? [
                    'id'               => $invoice->order->id,
                    'order_number'     => $invoice->order->order_number,
                    'transaction_type' => $invoice->order->transaction_type,
                    'items'            => $invoice->order->items->map(fn ($item) => [
                        'product' => $item->product?->name ?? '—',
                        'brand'   => $item->product?->brand ?? '',
                        'qty'     => $item->quantity,
                        'price'   => (float) $item->unit_price,
                        'subtotal'=> (float) $item->subtotal,
                    ])->values()->all(),
                ] : null,
            ],
        ]);
    }

    /**
     * Record a manual (COD) payment for an invoice.
     */
    /**
     * Commission the store owes the platform for this sale. Uses the recorded
     * commission once the order is delivered + paid, otherwise an estimate.
     */
    private function commissionInfo(Invoice $invoice): array
    {
        $commission = $invoice->order_id
            ? \App\Models\Commission::with('invoice')->where('order_id', $invoice->order_id)->first()
            : null;

        if ($commission) {
            return [
                'amount'         => (float) $commission->commission_amount,
                'rate'           => (float) $commission->commission_rate,
                'status'         => $commission->status,
                'is_estimate'    => false,
                'invoice_id'     => $commission->commission_invoice_id,
                'invoice_number' => $commission->invoice?->invoice_number,
            ];
        }

        $store = request()->attributes->get('seller_store');
        $rate  = (float) ($store?->commission_rate ?: \App\Models\Commission::DEFAULT_RATE);

        return [
            'amount'         => round((float) $invoice->total_amount * $rate / 100, 2),
            'rate'           => $rate,
            'status'         => null,
            'is_estimate'    => true,
            'invoice_id'     => null,
            'invoice_number' => null,
        ];
    }

    public function recordPayment(Request $request, Invoice $invoice): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($invoice->store_id !== $store->id) abort(403);

        if ($invoice->payment_status === 'paid') {
            return back()->with('error', 'This invoice is already fully paid.');
        }

        $data = $request->validate([
            'payment_method' => 'required|in:cash,gcash,bank_transfer,maya',
            'amount'         => 'required|numeric|min:0.01',
        ]);

        $amount = (float) $data['amount'];
        $total  = (float) $invoice->total_amount + (float) ($invoice->order?->shipping_fee ?? 0);
        $status = $amount >= $total ? 'paid' : 'partial';

        $invoice->update([
            'payment_status' => $status,
            'paid_amount'    => $amount,
            'payment_method' => $data['payment_method'],
            'paid_at'        => $status === 'paid' ? now() : null,
        ]);

        if ($invoice->order) {
            $settlesConsignment = $status === 'paid'
                && $invoice->order->payment_mode === 'consignment' && $invoice->order->payment_status === 'partial';

            $invoice->order->update([
                'payment_status' => $status,
                'payment_method' => $data['payment_method'],
            ] + ($status === 'paid' && $invoice->order->payment_mode === 'consignment' ? ['remaining_balance' => 0] : []));

            if ($status === 'paid') {
                \App\Services\OrderPaymentService::recordCommission($invoice->order->fresh());
            }
            if ($settlesConsignment) {
                \App\Services\LoyaltyService::recordBalancePaid($invoice->order->fresh());
            }
        }

        return back()->with('success', 'Payment recorded successfully.');
    }
}
