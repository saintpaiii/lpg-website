<?php

use App\Models\Notification;
use App\Support\StoreContext;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('an owner WITHOUT branches sees the same seller pages and data as before', function () {
    $store = $this->makeStore();
    $owner = \App\Models\User::find($store->user_id);
    $p = $this->makeProduct($store, 11);
    $this->makeProduct($store, 22);
    [, $c] = $this->makeCustomer();
    $this->makeOrder($c, $store, [[$p, 1]]);
    $other = $this->makeStore();
    $this->makeProduct($other, 11);

    foreach (['/seller/dashboard', '/seller/orders', '/seller/products', '/seller/inventory', '/seller/staff', '/seller/settings', '/seller/plan', '/seller/vehicles'] as $url) {
        $this->actingAs($owner)->get($url)->assertOk()->assertInertia(fn ($pg) => $pg->where('auth.store.id', $store->id)->where('auth.owned_stores', null));
    }
    $this->actingAs($owner)->get('/seller/inventory')->assertInertia(fn ($pg) => $pg->where('inventories.total', 2));
    $this->actingAs($owner)->get('/seller/orders')->assertInertia(fn ($pg) => $pg->where('orders.total', 1));
    // Branches page: no branches, Add branch available (paid Premium); the main dashboard needs ≥ 1 branch to be useful but opens
    $this->actingAs($owner)->get('/seller/branches')->assertOk()->assertInertia(fn ($pg) => $pg->has('stores', 1)->where('canAdd', true));

    // Notification links of a store without branches are unchanged (no "?store=")
    \App\Services\NotificationService::sendToStore($store->id, 'system', 'T', 'M', ['link' => '/seller/orders/1']);
    expect(Notification::where('user_id', $owner->id)->latest('id')->first()->data['link'])->toBe('/seller/orders/1');
    expect(StoreContext::ownedStoreIds($owner))->toBe([$store->id])->and($owner->ownedStore->id)->toBe($store->id);
});
