<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Exceptions\PaymentServiceUnavailable;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

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
            // Consignment down payment / half payment's first half (J5) — the rest is paid later
            $isConsign = in_array($order->payment_mode, ['consignment', 'half'], true) && (float) $order->down_payment_amount > 0;
            $isHalf    = $order->payment_mode === 'half';
            $amount    = $isConsign ? (float) $order->down_payment_amount : $order->grandTotal();

            $lineItems = [[
                'name'        => $isHalf ? "Half Payment (50%) — Order {$order->order_number}" : ($isConsign ? "Down Payment — Order {$order->order_number}" : "LPG Order {$order->order_number}"),
                'description' => $isHalf ? 'First half — the rest is paid before delivery or in cash to the rider' : ($isConsign ? 'Consignment down payment' : 'Items + delivery fee'),
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
            Log::warning('Pay now error: ' . $e->getMessage(), ['user_id' => auth()->id(), 'order_id' => $order->id]);
            return response()->json(['error' => PaymentServiceUnavailable::friendlyMessage($e) ?? 'Could not start payment. Please try again later.'], 422);
        }
    }

    /**
     * Pay the remaining balance of a partially-paid order: a consignment balance, or the second half of a
     * half-payment order (J5 — online any time before the order is delivered; after that the rider collected it).
     */
    public function payBalance(Request $request, Order $order): \Illuminate\Http\JsonResponse
    {
        $customer = $this->getCustomer($request);

        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        if (! in_array($order->payment_mode, ['consignment', 'half'], true) || $order->payment_status !== 'partial') {
            return response()->json(['error' => 'This order is not eligible for balance payment.'], 422);
        }
        if ($order->payment_mode === 'half' && in_array($order->status, ['delivered', 'cancelled'], true)) {
            return response()->json(['error' => $order->status === 'cancelled'
                ? 'This order was cancelled — nothing more to pay.'
                : 'This order was delivered — the rest is paid in cash to the rider.'], 422);
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
                    'name'        => $order->payment_mode === 'half' ? "Second Half — Order {$order->order_number}" : "Remaining Balance — Order {$order->order_number}",
                    'description' => $order->payment_mode === 'half' ? 'The remaining 50% of the order' : 'Full balance settlement',
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
            Log::warning('Pay balance error: ' . $e->getMessage(), ['user_id' => auth()->id(), 'order_id' => $order->id]);
            return response()->json(['error' => PaymentServiceUnavailable::friendlyMessage($e) ?? 'Could not start balance payment. Please try again later.'], 422);
        }
    }
}
