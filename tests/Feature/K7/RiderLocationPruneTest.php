<?php

use App\Models\RiderLocation;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('60 GPS pings for one delivery → every ping 200, exactly the 50 newest rows remain (MySQL)', function () {
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11);
    $rider = $this->makeRider($store);
    $this->clockIn($rider, $this->makeVehicle($store, 'tricycle', 150, 6));
    [, $c] = $this->makeCustomer();
    $order = $this->makeOrder($c, $store, [[$p, 1]], ['status' => 'out_for_delivery']);
    $d = $this->makeDelivery($order, $rider, 'in_transit');
    $other = $this->makeDelivery($this->makeOrder($c, $store, [[$p, 1]], ['status' => 'out_for_delivery']), $rider, 'in_transit');
    RiderLocation::create(['delivery_id' => $other->id, 'rider_id' => $rider->id, 'latitude' => 14.4, 'longitude' => 120.9]);

    for ($i = 1; $i <= 60; $i++) {
        $this->actingAs($rider)->postJson('/rider/location', [
            'delivery_id' => $d->id, 'latitude' => 14.4 + $i / 10000, 'longitude' => 120.9,
        ])->assertOk();
    }

    $rows = RiderLocation::where('delivery_id', $d->id)->orderBy('id')->get();
    expect($rows)->toHaveCount(50)
        ->and((float) $rows->first()->latitude)->toEqualWithDelta(14.4011, 0.00001)   // pings 11–60 kept
        ->and((float) $rows->last()->latitude)->toEqualWithDelta(14.4060, 0.00001)
        ->and(RiderLocation::where('delivery_id', $other->id)->count())->toBe(1);    // other deliveries untouched
});
