<?php

use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentReceipt;
use App\Models\RefundRequest;
use App\Services\OrderPaymentService;
use App\Services\RefundService;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    [$this->user, $customer] = $this->makeCustomer();
    $p = $this->makeProduct($this->store, 11, 750, 950);
    // ₱750 + ₱50 delivery = ₱800 → half payment 400 / 400
    [$x, $y] = Order::halfSplit(800);
    $this->order = $this->makeOrder($customer, $this->store, [[$p, 1]], ['payment_mode' => 'half', 'payment_method' => null, 'down_payment_amount' => $x, 'remaining_balance' => $y]);
    $pay = fn (float $amount) => Payment::create(['order_id' => $this->order->id, 'paymongo_checkout_id' => 'cs_test_' . uniqid(), 'amount' => $amount, 'status' => 'pending']);

    OrderPaymentService::applyPaidCheckoutRow($pay($x)->id, 'gcash', 'pay_first');
    // Two "Pay the remaining" pages opened → both paid
    $this->second = $pay($y);
    $this->third = $pay($y);
    OrderPaymentService::applyPaidCheckoutRow($this->second->id, 'gcash', 'pay_second');
});

test('a second balance payment after the order is fully paid is recorded, refunded once, and gets no receipt', function () {
    expect($this->order->fresh()->payment_status)->toBe('paid');
    $receipts = PaymentReceipt::where('order_id', $this->order->id)->count();

    OrderPaymentService::applyPaidCheckoutRow($this->third->id, 'gcash', 'pay_third');

    $refunds = RefundRequest::where('order_id', $this->order->id)->get();
    expect($this->third->fresh()->status)->toBe('paid')
        ->and($this->third->fresh()->paymongo_payment_id)->toBe('pay_third')
        ->and($refunds)->toHaveCount(1)
        ->and($refunds[0]->reason)->toBe('overpayment')
        ->and((float) $refunds[0]->amount)->toBe(400.0)
        ->and($refunds[0]->payment_id)->toBe($this->third->id)
        ->and($refunds[0]->preferred_resolution)->toBe('money_refund')
        ->and(PaymentReceipt::where('order_id', $this->order->id)->count())->toBe($receipts)
        ->and($this->order->fresh()->payment_status)->toBe('paid');
});

test('the same payment never creates two refund requests (webhook + redirect both firing)', function () {
    OrderPaymentService::applyPaidCheckoutRow($this->third->id, 'gcash', 'pay_third');
    OrderPaymentService::applyPaidCheckoutRow($this->third->id, 'gcash', 'pay_third');   // row already paid → no-op
    RefundService::forOverpayment($this->order->fresh(), $this->third->fresh(), 400);     // direct second call → same request

    expect(RefundRequest::where('order_id', $this->order->id)->where('reason', 'overpayment')->count())->toBe(1);
});

test('the paid webhook for the extra session is handled the same way (repeated → still one)', function () {
    $body = ['data' => ['attributes' => ['type' => 'checkout_session.payment.paid', 'data' => ['id' => $this->third->paymongo_checkout_id,
        'attributes' => ['payments' => [['data' => ['id' => 'pay_hook', 'attributes' => ['source' => ['type' => 'gcash']]]]]]]]]];
    // Signed like PayMongo does (test-only secret): "t={timestamp},te={hmac}"
    config(['paymongo.webhook_secret' => 'whsec_j6_test']);
    app()->forgetInstance(\App\Services\PayMongoService::class);
    $raw = json_encode($body);
    $ts = time();
    $sig = "t={$ts},te=" . hash_hmac('sha256', "{$ts}.{$raw}", 'whsec_j6_test');
    $send = fn () => $this->call('POST', '/api/paymongo/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_PAYMONGO_SIGNATURE' => $sig], $raw);

    $send()->assertOk();
    $send()->assertOk();

    expect(RefundRequest::where('order_id', $this->order->id)->where('reason', 'overpayment')->count())->toBe(1);
});
