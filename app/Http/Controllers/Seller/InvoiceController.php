<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceController extends Controller
{
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

        $invoices = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($i) => [
                'id'                  => $i->id,
                'invoice_number'      => $i->invoice_number,
                'total_amount'        => (float) $i->total_amount,
                'paid_amount'         => (float) $i->paid_amount,
                'payment_status'      => $i->payment_status,
                'payment_method'      => $i->payment_method,
                'platform_commission' => (float) ($i->platform_commission ?? 0),
                'net_amount'          => (float) $i->total_amount - (float) ($i->platform_commission ?? 0),
                'due_date'            => $i->due_date?->format('M d, Y'),
                'paid_at'             => $i->paid_at?->format('M d, Y'),
                'created_at'          => $i->created_at->format('M d, Y'),
                'customer'            => $i->customer?->name ?? '—',
                'order_number'        => $i->order?->order_number ?? '—',
                'order_id'            => $i->order_id,
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
            'tab'      => $tab,
            'search'   => $search ?? '',
        ]);
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
            'invoice' => [
                'id'                  => $invoice->id,
                'invoice_number'      => $invoice->invoice_number,
                'total_amount'        => (float) $invoice->total_amount,
                'shipping_fee'        => $shippingFee,
                'paid_amount'         => (float) $invoice->paid_amount,
                'payment_status'      => $invoice->payment_status,
                'payment_method'      => $invoice->payment_method,
                'platform_commission' => (float) ($invoice->platform_commission ?? 0),
                'net_amount'          => (float) $invoice->total_amount - (float) ($invoice->platform_commission ?? 0) + $shippingFee,
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
            $invoice->order->update([
                'payment_status' => $status,
                'payment_method' => $data['payment_method'],
            ]);
        }

        return back()->with('success', 'Payment recorded successfully.');
    }
}
