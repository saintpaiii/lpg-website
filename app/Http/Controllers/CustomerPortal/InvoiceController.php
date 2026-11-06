<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceController extends Controller
{
    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    public function index(Request $request): Response
    {
        $customer = $this->getCustomer($request);

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');

        $invoices = collect();
        if ($customer) {
            $invQuery = $customer->invoices()->with('order')->orderByDesc('created_at');
            if ($dateFrom) $invQuery->whereDate('created_at', '>=', $dateFrom);
            if ($dateTo)   $invQuery->whereDate('created_at', '<=', $dateTo);

            $invoices = $invQuery
                ->paginate(15)
                ->withQueryString()
                ->through(fn ($inv) => [
                    'id'             => $inv->id,
                    'seen'           => \App\Services\SectionVisitService::flagsFor($request, $inv),
                    'invoice_number' => $inv->invoice_number,
                    'total_amount'   => (float) $inv->total_amount,
                    'payment_status' => $inv->payment_status,
                    'paid_amount'    => (float) $inv->paid_amount,
                    'payment_method' => $inv->payment_method,
                    'due_date'       => $inv->due_date?->format('M d, Y'),
                    'paid_at'        => $inv->paid_at?->format('M d, Y'),
                    'created_at'     => $inv->created_at->format('M d, Y'),
                    'order_number'   => $inv->order?->order_number,
                    'order_status'   => $inv->order?->status,
                ]);
        }

        return Inertia::render('customer/invoices', [
            'since'     => \App\Services\SectionVisitService::sinceIso($request),
            'invoices'  => $invoices,
            'date_from' => $request->get('date_from') ?: '',
            'date_to'   => $request->get('date_to')   ?: '',
        ]);
    }

    public function show(Request $request, Invoice $invoice): Response
    {
        $customer = $this->getCustomer($request);

        // Security: customer can only view their own invoices
        if (! $customer || $invoice->customer_id !== $customer->id) {
            abort(403);
        }

        $invoice->load(['order.items.product', 'customer']);
        $doc = \App\Services\InvoiceService::viewData($invoice);

        return Inertia::render('customer/invoice-show', [
            'doc'       => $doc,
            'breakdown' => $doc['breakdown'],
            'invoice' => [
                'id'             => $invoice->id,
                'invoice_number' => $invoice->invoice_number,
                'total_amount'   => (float) $invoice->total_amount,
                'payment_status' => $invoice->payment_status,
                'paid_amount'    => $invoice->payment_status === 'paid' && $invoice->order
                    ? max($invoice->order->grandTotal(), (float) $invoice->paid_amount)
                    : (float) $invoice->paid_amount,
                'payment_method' => $invoice->payment_method,
                'due_date'       => $invoice->due_date?->format('M d, Y'),
                'paid_at'        => $invoice->paid_at?->format('M d, Y'),
                'created_at'     => $invoice->created_at->format('M d, Y'),
                'order'          => $invoice->order ? [
                    'order_number' => $invoice->order->order_number,
                    'status'       => $invoice->order->status,
                    'ordered_at'   => $invoice->order->ordered_at?->format('M d, Y'),
                    'items'        => $invoice->order->items->map(fn ($i) => [
                        'quantity'   => $i->quantity,
                        'unit_price' => (float) $i->unit_price,
                        'subtotal'   => (float) $i->subtotal,
                        'product'    => $i->product ? [
                            'name'  => $i->product->name,
                            'brand' => $i->product->brand,
                        ] : null,
                    ])->values()->all(),
                ] : null,
            ],
        ]);
    }

    /** The customer's own invoice as an A4 PDF. */
    public function pdf(Request $request, Invoice $invoice)
    {
        $customer = $this->getCustomer($request);
        if (! $customer || $invoice->customer_id !== $customer->id) {
            abort(403);
        }

        return response(\App\Services\InvoiceService::pdf($invoice), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => "inline; filename=\"{$invoice->invoice_number}.pdf\"",
        ]);
    }
}
