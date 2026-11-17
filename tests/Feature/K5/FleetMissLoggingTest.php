<?php

use App\Models\CartItem;
use App\Models\VehicleCapacityMiss;
use App\Services\VehicleDssService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('loading checkout with an over-capacity cart logs one capacity miss (deduped), and the Fleet card counts it', function () {
    $store = $this->makeStore();
    $this->makeVehicle($store, 'multicab', 300, 12, ['11' => 4]);   // 5 × 11 kg = 125 kg fits by weight, not by the 4 × 11 kg limit
    $this->giveLicense($this->makeRider($store));   // a licensed rider + a priced vehicle → the store delivers
    $p11 = $this->makeProduct($store, 11, 750, 950);
    [$user] = $this->makeCustomer();
    CartItem::create(['user_id' => $user->id, 'product_id' => $p11->id, 'store_id' => $store->id, 'quantity' => 5, 'transaction_type' => 'refill']);

    $this->actingAs($user)->get("/customer/checkout?selected[]={$p11->id}")->assertOk();
    expect(VehicleCapacityMiss::where('store_id', $store->id)->get())->toHaveCount(1)
        ->and(VehicleCapacityMiss::first()->reason)->toBe('too_many_of_size')
        ->and(VehicleCapacityMiss::first()->by_size)->toEqual(['11' => 5]);

    // Again within 10 minutes → still one row
    $this->actingAs($user)->get("/customer/checkout?selected[]={$p11->id}")->assertOk();
    expect(VehicleCapacityMiss::where('store_id', $store->id)->count())->toBe(1);

    // The POST (if it ever happens) reuses the same row too
    $this->actingAs($user)->postJson('/customer/checkout', ['notes' => '', 'fulfillments' => [$store->id => 'delivery'], 'payment_modes' => [$store->id => 'cod'],
        'empty_tanks_confirmed' => true, 'delivery_latitude' => 14.42, 'delivery_longitude' => 120.95, 'delivery_address' => '2 Mabini St.', 'delivery_barangay' => 'Alapan I-A', 'delivery_city' => 'Imus'])
        ->assertStatus(422);
    expect(VehicleCapacityMiss::where('store_id', $store->id)->count())->toBe(1)
        ->and(VehicleDssService::fleet($store->fresh())['miss_count'])->toBe(1);
});

test('a cart that fits logs nothing, and a pick-up-only store is skipped', function () {
    $store = $this->makeStore();
    $this->makeVehicle($store, 'multicab', 300, 12, ['11' => 4]);
    $this->giveLicense($this->makeRider($store));
    $p11 = $this->makeProduct($store, 11);
    [$user] = $this->makeCustomer();
    CartItem::create(['user_id' => $user->id, 'product_id' => $p11->id, 'store_id' => $store->id, 'quantity' => 4, 'transaction_type' => 'refill']);
    $this->actingAs($user)->get("/customer/checkout?selected[]={$p11->id}")->assertOk();
    expect(VehicleCapacityMiss::count())->toBe(0);

    // No rider → pick-up only: never a capacity miss
    $pickupStore = $this->makeStore(['allow_pickup' => true]);
    $this->makeVehicle($pickupStore, 'motorcycle', 60, 2);
    $p = $this->makeProduct($pickupStore, 11);
    CartItem::create(['user_id' => $user->id, 'product_id' => $p->id, 'store_id' => $pickupStore->id, 'quantity' => 5, 'transaction_type' => 'refill']);
    $this->actingAs($user)->get("/customer/checkout?selected[]={$p->id}")->assertOk();
    expect(VehicleCapacityMiss::where('store_id', $pickupStore->id)->count())->toBe(0);
});
