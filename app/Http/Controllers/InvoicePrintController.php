<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Setting;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoicePrintController extends Controller
{
    public function show(Request $request, Invoice $invoice): Response
    {
        $user = $request->user();

        // Staff can print any invoice; customers can only print their own
        if ($user->role === 'customer') {
            $customer = \App\Models\Customer::where('user_id', $user->id)->first();
            if (! $customer || $invoice->customer_id !== $customer->id) {
                abort(403);
            }
        } elseif (! $user->isStaff()) {
            abort(403);
        }

        $invoice->load(['order.items.product', 'customer']);

        $company = [
            'name'    => Setting::get('company_name', 'LPG Distribution Cavite'),
            'address' => Setting::get('company_address', ''),
            'phone'   => Setting::get('company_phone', ''),
            'email'   => Setting::get('company_email', ''),
        ];

        return Inertia::render('invoice-print', [
            'invoice' => [
                'id'             => $invoice->id,
                'invoice_number' => $invoice->invoice_number,
                'total_amount'   => (float) $invoice->total_amount,
                'payment_status' => $invoice->payment_status,
                'paid_amount'    => (float) $invoice->paid_amount,
                'payment_method' => $invoice->payment_method,
                'due_date'       => $invoice->due_date?->format('M d, Y'),
                'paid_at'        => $invoice->paid_at?->format('M d, Y'),
                'created_at'     => $invoice->created_at->format('M d, Y'),
                'customer'       => $invoice->customer ? [
                    'name'     => $invoice->customer->name,
                    'phone'    => $invoice->customer->phone,
                    'address'  => $invoice->customer->address,
                    'city'     => $invoice->customer->city,
                    'barangay' => $invoice->customer->barangay,
                ] : null,
                'order' => $invoice->order ? [
                    'order_number'     => $invoice->order->order_number,
                    'status'           => $invoice->order->status,
                    'transaction_type' => $invoice->order->transaction_type,
                    'ordered_at'       => $invoice->order->ordered_at?->format('M d, Y g:i A'),
                    'delivered_at'     => $invoice->order->delivered_at?->format('M d, Y g:i A'),
                    'items'            => $invoice->order->items->map(fn ($i) => [
                        'quantity'   => $i->quantity,
                        'unit_price' => (float) $i->unit_price,
                        'subtotal'   => (float) $i->subtotal,
                        'product'    => $i->product ? [
                            'name'      => $i->product->name,
                            'brand'     => $i->product->brand,
                            'weight_kg' => (float) $i->product->weight_kg,
                        ] : null,
                    ])->values()->all(),
                ] : null,
            ],
            'company' => $company,
        ]);
    }
}
