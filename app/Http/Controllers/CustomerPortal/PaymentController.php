<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    /**
     * Create (or re-create) a PayMongo Checkout Session for an unpaid order.
     */
    public function payNow(Request $request, Order $order): JsonResponse
    {
        $customer = $this->getCustomer($request);

        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        if ($order->payment_status !== 'unpaid') {
            return response()->json(['error' => 'This order has no unpaid amount to settle here.'], 422);
        }

        try {
            $paymongo  = app(PayMongoService::class);
            $user      = $request->user();
            $isConsign = $order->payment_mode === 'consignment' && (float) $order->down_payment_amount > 0;
            $amount    = $isConsign ? (float) $order->down_payment_amount : $order->grandTotal();

            $lineItems = [[
                'name'        => $isConsign ? "Down Payment — Order {$order->order_number}" : "LPG Order {$order->order_number}",
                'description' => $isConsign ? 'Consignment down payment' : 'Items + delivery fee',
                'amount'      => (int) round($amount * 100),
                'currency'    => 'PHP',
                'quantity'    => 1,
            ]];

            $session = $paymongo->createCheckoutSession([
                'reference_number' => $order->order_number,
                'description'      => "LPG Order {$order->order_number}",
                'line_items'       => $lineItems,
                'success_url'      => url("/customer/orders/{$order->id}?payment=success"),
                'cancel_url'       => url("/customer/orders/{$order->id}?payment=cancelled"),
                'customer_name'    => $user->name,
                'customer_email'   => $user->email,
                'customer_phone'   => $user->phone ?? '',
            ]);

            Payment::create([
                'order_id'             => $order->id,
                'paymongo_checkout_id' => $session['id'],
                'amount'               => $amount,
                'status'               => 'pending',
            ]);

            return response()->json(['checkout_url' => $session['checkout_url']]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Could not start payment. Please try again later.'], 422);
        }
    }

    /**
     * Pay the remaining consignment balance for a partially-paid order.
     */
    public function payBalance(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $customer = $this->getCustomer($request);

        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        if ($order->payment_mode !== 'consignment' || $order->payment_status !== 'partial') {
            return response()->json(['error' => 'This order is not eligible for balance payment.'], 422);
        }

        $remaining = (float) $order->remaining_balance;
        if ($remaining <= 0) {
            return response()->json(['error' => 'No remaining balance.'], 422);
        }

        try {
            $paymongo = app(PayMongoService::class);
            $user     = $request->user();

            $session = $paymongo->createCheckoutSession([
                'reference_number' => $order->order_number . '-BAL',
                'description'      => "Balance Payment — Order {$order->order_number}",
                'line_items'       => [[
                    'name'        => "Remaining Balance — Order {$order->order_number}",
                    'description' => 'Full balance settlement',
                    'amount'      => (int) round($remaining * 100),
                    'currency'    => 'PHP',
                    'quantity'    => 1,
                ]],
                'success_url'      => url("/customer/orders/{$order->id}?payment=success"),
                'cancel_url'       => url("/customer/orders/{$order->id}?payment=cancelled"),
                'customer_name'    => $user->name,
                'customer_email'   => $user->email,
                'customer_phone'   => $user->phone ?? '',
            ]);

            Payment::create([
                'order_id'             => $order->id,
                'paymongo_checkout_id' => $session['id'],
                'amount'               => $remaining,
                'status'               => 'pending',
            ]);

            return response()->json(['checkout_url' => $session['checkout_url']]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Could not start balance payment. Please try again later.'], 422);
        }
    }
}
