<?php

use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentReceipt;
use App\Models\RefundRequest;
use App\Services\OrderPaymentService;
use App\Services\PayMongoService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('returning from an older "Pay the remaining" checkout after the rider collected cash records the payment and creates ONE overpayment refund', function () {
    $store = $this->makeStore();
    [$user, $customer] = $this->makeCustomer();
    $p = $this->makeProduct($store, 11, 750, 950);
    [$x, $y] = Order::halfSplit(800);   // ₱750 + ₱50 delivery
    $order = $this->makeOrder($customer, $store, [[$p, 1]], ['payment_mode' => 'half', 'payment_method' => null, 'down_payment_amount' => $x, 'remaining_balance' => $y]);

    // First half paid online
    $first = Payment::create(['order_id' => $order->id, 'paymongo_checkout_id' => 'cs_first', 'amount' => $x, 'status' => 'pending']);
    OrderPaymentService::applyPaidCheckoutRow($first->id, 'gcash', 'pay_first');
    // The customer opens "Pay the remaining" (not paid yet)…
    $balance = Payment::create(['order_id' => $order->id, 'paymongo_checkout_id' => 'cs_balance', 'amount' => $y, 'status' => 'pending']);
    // …the rider collects the rest in cash → paid
    OrderPaymentService::markPaid($order->fresh(), 'cash', 'cash_on_delivery');
    $order->update(['status' => 'delivered', 'delivered_at' => now()]);
    expect($order->fresh()->payment_status)->toBe('paid');
    $receipts = PaymentReceipt::where('order_id', $order->id)->count();

    // …then finishes the old PayMongo page: PayMongo now reports that session as paid
    $this->mock(PayMongoService::class, fn ($m) => $m->shouldReceive('retrieveCheckoutSession')->with('cs_balance')->andReturn([
        'id' => 'cs_balance',
        'attributes' => ['payments' => [['id' => 'pay_late', 'attributes' => ['status' => 'paid', 'source' => ['type' => 'gcash']]]]],
    ]));

    $res = $this->actingAs($user)->get("/customer/orders/{$order->id}?payment=success")->assertOk();
    expect($res->inertiaProps('flash.success'))->toBe('We received an extra payment of ₱400.00. A refund request was created automatically.');

    $this->actingAs($user)->get("/customer/orders/{$order->id}?payment=success")->assertOk();

    $refunds = RefundRequest::where('order_id', $order->id)->get();
    expect($refunds)->toHaveCount(1)
        ->and($refunds[0]->reason)->toBe('overpayment')
        ->and((float) $refunds[0]->amount)->toBe(400.0)
        ->and($refunds[0]->payment_id)->toBe($balance->id)
        ->and($balance->fresh()->status)->toBe('paid')
        ->and($balance->fresh()->paymongo_payment_id)->toBe('pay_late')
        ->and(PaymentReceipt::where('order_id', $order->id)->count())->toBe($receipts)
        ->and($order->fresh()->payment_status)->toBe('paid');
});
