<?php

use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Services\OrderPaymentService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('a half-payment order cannot be confirmed (or get a rider) until the first half is paid', function () {
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    [, $customer] = $this->makeCustomer();
    $p = $this->makeProduct($store, 11, 750, 950);
    $rider = $this->makeRider($store);
    $this->clockIn($rider, $this->makeVehicle($store, 'tricycle', 150, 6));
    [$x, $y] = Order::halfSplit(800);
    $order = $this->makeOrder($customer, $store, [[$p, 1]], ['status' => 'pending', 'payment_mode' => 'half', 'payment_method' => null, 'down_payment_amount' => $x, 'remaining_balance' => $y]);

    $this->actingAs($owner)->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])
        ->assertSessionHas('error', fn ($m) => str_contains($m, 'Waiting for the first half payment'));
    expect($order->fresh()->status)->toBe('pending');

    // Rider assignment is blocked too (an unpaid half order that somehow got confirmed)
    $order->update(['status' => 'confirmed']);
    $this->actingAs($owner)->post("/seller/orders/{$order->id}/assign-delivery", ['rider_id' => $rider->id])
        ->assertSessionHas('error', fn ($m) => str_contains($m, 'Waiting for the first half payment'));
    $order->update(['status' => 'pending']);

    // First half paid → partial → confirm OK
    $pay = Payment::create(['order_id' => $order->id, 'paymongo_checkout_id' => 'cs_half_1', 'amount' => $x, 'status' => 'pending']);
    OrderPaymentService::applyPaidCheckoutRow($pay->id, 'gcash', 'pay_half_1');
    expect($order->fresh()->payment_status)->toBe('partial');

    $this->actingAs($owner)->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])->assertSessionHasNoErrors()->assertSessionMissing('error');
    expect($order->fresh()->status)->toBe('confirmed');
});
