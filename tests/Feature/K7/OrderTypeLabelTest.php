<?php

use App\Models\User;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('a mixed order shows its real mix ("Refill + Accessory") on the customer page, the seller list / detail and the export', function () {
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $tank = $this->makeProduct($store, 11);
    $reg = $this->makeAccessory($store, 'Regulator');
    [$cu, $c] = $this->makeCustomer();
    $mixed = $this->makeOrder($c, $store, [[$tank, 2], [$reg, 1]], ['status' => 'delivered']);   // accessory line is stored as 'refill' by the helper
    $plain = $this->makeOrder($c, $store, [[$tank, 1]], ['status' => 'delivered']);
    $newTank = $this->makeOrder($c, $store, [[$tank, 1]], ['status' => 'delivered', 'transaction_type' => 'new_purchase']);
    $newTank->items()->update(['transaction_type' => 'new_purchase']);

    expect($mixed->fresh()->typeLabel())->toBe('Refill + Accessory')
        ->and($plain->fresh()->typeLabel())->toBe('Refill')
        ->and($newTank->fresh()->typeLabel())->toBe('New purchase');

    // Refill + new purchase + accessory → each kind, in order
    $all = $this->makeOrder($c, $store, [[$tank, 1], [$reg, 1]], ['status' => 'delivered']);
    $all->items()->create(['product_id' => $tank->id, 'quantity' => 1, 'unit_price' => 900, 'subtotal' => 900, 'transaction_type' => 'new_purchase']);
    expect($all->fresh()->typeLabel())->toBe('Refill + New purchase + Accessory');

    $this->actingAs($cu)->get("/customer/orders/{$mixed->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->where('order.type_label', 'Refill + Accessory'));
    $this->actingAs($owner)->get("/seller/orders/{$mixed->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->where('order.type_label', 'Refill + Accessory'));
    // The order's own transaction_type is unchanged (stored value, used by the cart / checkout rules)
    expect($mixed->fresh()->transaction_type)->toBe('refill');

    $csv = $this->actingAs($owner)->get('/seller/orders/export?format=csv');
    $content = $csv->streamedContent();
    expect($content)->toContain('Refill + Accessory');
});
