<?php

use App\Models\RiderCurrentLocation;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $p = $this->makeProduct($this->store, 11);
    $this->rider = $this->makeRider($this->store);
    $this->clockIn($this->rider, $this->makeVehicle($this->store, 'tricycle', 150, 6));
    [$this->userA, $a] = $this->makeCustomer();
    [$this->userB, $b] = $this->makeCustomer();
    $this->orderA = $this->makeOrder($a, $this->store, [[$p, 1]], ['status' => 'out_for_delivery']);
    $this->orderB = $this->makeOrder($b, $this->store, [[$p, 1]], ['status' => 'out_for_delivery']);
    // One trip: A is stop 1, B is stop 2
    $this->dA = $this->makeDelivery($this->orderA, $this->rider, 'picked_up', ['batch_id' => 'b1', 'sequence' => 1]);
    $this->dB = $this->makeDelivery($this->orderB, $this->rider, 'picked_up', ['batch_id' => 'b1', 'sequence' => 2]);
    RiderCurrentLocation::record($this->rider->id, 14.4187654, 120.9456789);
});

test('exact coordinates only when this order is the rider\'s next stop', function () {
    $a = $this->actingAs($this->userA)->getJson("/customer/orders/{$this->orderA->id}/tracking")->assertOk()->json('rider_area');
    expect($a)->toMatchArray(['lat' => 14.4187654, 'lng' => 120.9456789, 'exact' => true]);

    $b = $this->actingAs($this->userB)->getJson("/customer/orders/{$this->orderB->id}/tracking")->assertOk()->json('rider_area');
    expect($b)->toMatchArray(['lat' => 14.42, 'lng' => 120.95, 'exact' => false]);
});

test('after the first stop is delivered, the next customer gets the exact position', function () {
    $this->dA->update(['status' => 'delivered', 'delivered_at' => now()]);
    $this->orderA->update(['status' => 'delivered']);

    $b = $this->actingAs($this->userB)->getJson("/customer/orders/{$this->orderB->id}/tracking")->assertOk()->json('rider_area');
    expect($b['exact'])->toBeTrue()->and($b['lat'])->toBe(14.4187654);

    // Delivered order: no rider position at all
    $a = $this->actingAs($this->userA)->getJson("/customer/orders/{$this->orderA->id}/tracking")->assertOk();
    expect($a->json('status'))->toBe('delivered')->and($a->json('rider_area'))->toBeNull();
});

test('other customers get 403', function () {
    $this->actingAs($this->userB)->getJson("/customer/orders/{$this->orderA->id}/tracking")->assertForbidden();
    $this->actingAs($this->userB)->getJson("/customer/orders/{$this->orderA->id}/rider-location")->assertForbidden();
});

test('assigned (not yet picked up) is never exact', function () {
    $this->dA->update(['status' => 'assigned']);
    $this->dB->update(['status' => 'assigned']);
    expect(\App\Services\RiderStatusService::exactForCustomer($this->dA->fresh()))->toBeFalse();
});
