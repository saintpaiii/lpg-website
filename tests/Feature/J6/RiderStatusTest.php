<?php

use App\Models\RiderCurrentLocation;
use App\Services\RiderStatusService;
use Illuminate\Support\Carbon;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('status rules: off shift / available / on delivery / returning / no GPS', function () {
    $now = Carbon::parse('2026-11-17 15:00');
    expect(RiderStatusService::statusFor(false, 0, null, null, $now))->toBe('off_shift')
        ->and(RiderStatusService::statusFor(true, 0, null, null, $now))->toBe('available')
        ->and(RiderStatusService::statusFor(true, 0, $now->copy()->subHour(), null, $now))->toBe('available')
        ->and(RiderStatusService::statusFor(true, 2, null, $now->copy()->subMinutes(2), $now))->toBe('on_delivery')
        ->and(RiderStatusService::statusFor(true, 0, $now->copy()->subMinutes(10), $now, $now))->toBe('returning')
        ->and(RiderStatusService::statusFor(true, 1, null, $now->copy()->subMinutes(11), $now))->toBe('no_gps')
        ->and(RiderStatusService::statusFor(true, 1, null, null, $now))->toBe('no_gps');
});

test('the board shows each rider with status, vehicle, load and position only while on shift', function () {
    $store = $this->makeStore();
    $p11 = $this->makeProduct($store, 11);
    $v = $this->makeVehicle($store, 'tricycle', 150, 6);
    [, $customer] = $this->makeCustomer();

    $off = $this->makeRider($store, ['name' => 'Off Rider']);
    RiderCurrentLocation::record($off->id, 14.41, 120.94);   // old point — never shown after clock-out

    $avail = $this->makeRider($store, ['name' => 'Avail Rider']);
    $this->clockIn($avail, $this->makeVehicle($store, 'motorcycle', 60, 2));

    $busy = $this->makeRider($store, ['name' => 'Busy Rider']);
    $this->clockIn($busy, $v);
    $this->makeDelivery($this->makeOrder($customer, $store, [[$p11, 3]]), $busy, 'in_transit');
    RiderCurrentLocation::record($busy->id, 14.415, 120.945);

    $board = collect(RiderStatusService::board($store))->keyBy('full_name');

    expect($board['Off Rider']['status'])->toBe('off_shift')
        ->and($board['Off Rider']['position'])->toBeNull()
        ->and($board['Avail Rider']['status'])->toBe('available')
        ->and($board['Busy Rider']['status'])->toBe('on_delivery')
        ->and($board['Busy Rider']['position'])->toBe(['lat' => 14.415, 'lng' => 120.945])
        ->and($board['Busy Rider']['load']['kg'])->toEqual(75)
        ->and($board['Busy Rider']['load']['max_kg'])->toEqual(150)
        ->and($board['Busy Rider']['stops'])->toHaveCount(1)
        ->and($board['Busy Rider']['vehicle']['label'])->toBe('Tricycle');

    $owner = \App\Models\User::find($store->user_id);
    $this->actingAs($owner)->getJson('/seller/deliveries/riders-live')->assertOk()->assertJsonCount(3, 'riders');
});
