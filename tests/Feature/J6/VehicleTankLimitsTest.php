<?php

use App\Services\DeliveryFeeService;
use App\Services\RiderLoadService;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950);
    $this->p50 = $this->makeProduct($this->store, 50, 3200, 4200);
});

test('a per-size limit blocks 5 × 11kg on a vehicle limited to 4 × 11kg even when the total kg fits', function () {
    $v = $this->makeVehicle($this->store, 'multicab', 300, 12, ['11' => 4]);
    $load = DeliveryFeeService::orderLoad([['product' => $this->p11, 'quantity' => 5]]);

    expect($load)->toMatchArray(['kg' => 125.0, 'tanks' => 5, 'by_size' => ['11' => 5]])
        ->and(DeliveryFeeService::fits($v, $load))->toContain('4 × 11 kg tanks per trip')
        ->and(DeliveryFeeService::fits($v, DeliveryFeeService::orderLoad([['product' => $this->p11, 'quantity' => 4]])))->toBeNull()
        ->and(DeliveryFeeService::quote($this->store->fresh(), 2.0, $load['kg'], $load['tanks'], $load['by_size']))->toBeNull()
        ->and(DeliveryFeeService::whyNoVehicleCode($this->store->fresh(), $load['kg'], $load['tanks'], $load['by_size']))->toBe('too_heavy')
        ->and(DeliveryFeeService::whyNoVehicle($this->store->fresh(), $load['kg'], $load['tanks'], $load['by_size']))->toStartWith('Too many tanks of one size');
});

test('null tank limits behave exactly as before (only total kg and tanks)', function () {
    $v = $this->makeVehicle($this->store, 'multicab', 300, 12, null);
    $five = DeliveryFeeService::orderLoad([['product' => $this->p11, 'quantity' => 5]]);
    $heavy = DeliveryFeeService::orderLoad([['product' => $this->p50, 'quantity' => 4]]);   // 360 kg

    expect(DeliveryFeeService::fits($v, $five))->toBeNull()
        ->and(DeliveryFeeService::quote($this->store->fresh(), null, $five['kg'], $five['tanks'], $five['by_size']))->not->toBeNull()
        ->and(DeliveryFeeService::quote($this->store->fresh(), null, $five['kg'], $five['tanks']))->not->toBeNull()   // old 4-arg call
        ->and(DeliveryFeeService::fits($v, $heavy))->toContain('300 kg');
});

test('the rider check counts the tanks already on board per size', function () {
    $v = $this->makeVehicle($this->store, 'multicab', 300, 12, ['11' => 4]);
    $rider = $this->makeRider($this->store);
    $this->clockIn($rider, $v);
    [, $customer] = $this->makeCustomer();
    $onBoard = $this->makeOrder($customer, $this->store, [[$this->p11, 3]]);
    $this->makeDelivery($onBoard, $rider, 'assigned');

    $two = $this->makeOrder($customer, $this->store, [[$this->p11, 2]]);
    $one = $this->makeOrder($customer, $this->store, [[$this->p11, 1]]);

    expect(RiderLoadService::canTake($rider, [$two]))->toContain('4 × 11 kg')
        ->and(RiderLoadService::canTake($rider, [$one]))->toBeNull();
});

test('validation rejects 4 × 50kg on a 300 kg vehicle and saves valid limits', function () {
    $owner = \App\Models\User::find($this->store->user_id);
    $base = ['vehicle_type' => 'multicab', 'plate_number' => 'ABC-123', 'max_capacity_kg' => 300, 'max_tanks' => 12, 'status' => 'available'];

    $this->actingAs($owner)->post('/seller/vehicles', $base + ['tank_limits' => [['size' => '50', 'max' => 4]]])
        ->assertSessionHasErrors(['tank_limits.0.max' => "4 × 50 kg tanks = 360 kg is over this vehicle's 300 kg limit."]);

    $this->actingAs($owner)->post('/seller/vehicles', $base + ['tank_limits' => [['size' => '11', 'max' => 4], ['size' => '50', 'max' => 3]]])
        ->assertSessionHasNoErrors();
    expect(\App\Models\Vehicle::where('plate_number', 'ABC-123')->first()->tank_limits)->toEqual(['11' => 4, '50' => 3]);
});

test('the cart alert and checkout agree (same vehicles, same fits rule)', function () {
    $this->makeVehicle($this->store, 'multicab', 300, 12, ['11' => 4]);
    $caps = DeliveryFeeService::capacities($this->store->fresh());
    $load = DeliveryFeeService::orderLoad([['product' => $this->p11, 'quantity' => 5]]);
    $anyFits = collect($caps)->contains(fn ($c) => DeliveryFeeService::fitsCapacity($c, $load) === null);

    // The cart gets exactly these capacities (+ size keys per item) and runs the same rule in TypeScript
    expect($caps[0])->toMatchArray(['kg' => 300.0, 'tanks' => 12, 'tank_limits' => ['11' => 4]])
        ->and($anyFits)->toBeFalse()
        ->and(DeliveryFeeService::quote($this->store->fresh(), null, $load['kg'], $load['tanks'], $load['by_size']) === null)->toBe(! $anyFits);
});
