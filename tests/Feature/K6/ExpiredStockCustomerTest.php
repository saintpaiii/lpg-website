<?php

use App\Models\CartItem;
use App\Services\StockService;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->p = $this->makeProduct($this->store, 11, 750, 950, 0);
    $this->makeBatch($this->p, 5, now()->subDays(10)->toDateString(), ['batch_code' => 'OLD-EXP']);   // the ONLY stock: expired
    $this->good = $this->makeProduct($this->store, 22, 1400, 1800, 3);
});

test('4: an expired-only product shows 0 / out of stock to customers (grid, product page, store page)', function () {
    [$user] = $this->makeCustomer();

    expect(StockService::usableMap([$this->p->id, $this->good->id]))->toBe([$this->p->id => 0, $this->good->id => 3]);

    $this->actingAs($user)->get('/customer/products')->assertOk()->assertInertia(fn ($page) => $page
        ->where('products.data', fn ($rows) => collect($rows)->firstWhere('id', $this->p->id)['stock'] === 0
            && collect($rows)->firstWhere('id', $this->good->id)['stock'] === 3));
    $this->actingAs($user)->get("/customer/products/{$this->p->id}")->assertOk()->assertInertia(fn ($page) => $page->where('product.stock', 0));
    $this->actingAs($user)->get("/customer/store/{$this->store->id}")->assertOk()->assertInertia(fn ($page) => $page
        ->where('products.data', fn ($rows) => collect($rows)->firstWhere('id', $this->p->id)['stock'] === 0));
});

test('4: adding it to the cart is refused; a cart line already there can\'t be checked out', function () {
    [$user] = $this->makeCustomer();

    $this->actingAs($user)->post('/customer/cart/add', ['product_id' => $this->p->id, 'quantity' => 1, 'transaction_type' => 'new_purchase'])
        ->assertSessionHas('error', "{$this->p->name} is out of stock.");
    expect(CartItem::where('user_id', $user->id)->count())->toBe(0);

    // e.g. added before the batch expired
    CartItem::create(['user_id' => $user->id, 'product_id' => $this->p->id, 'store_id' => $this->store->id, 'quantity' => 1, 'transaction_type' => 'new_purchase']);
    $this->actingAs($user)->get('/customer/cart')->assertInertia(fn ($page) => $page->where("cart.stores.{$this->store->id}.items.0.stock", 0));

    $this->makeVehicle($this->store, 'tricycle', 150, 6);
    $this->giveLicense($this->makeRider($this->store));
    $res = $this->actingAs($user)->withSession(['cart_selected' => [$this->p->id]])->postJson('/customer/checkout', ['notes' => '', 'fulfillments' => [$this->store->id => 'delivery'],
        'payment_modes' => [$this->store->id => 'cod'], 'delivery_latitude' => 14.42, 'delivery_longitude' => 120.95, 'delivery_address' => '2 Mabini St.',
        'delivery_barangay' => 'Alapan I-A', 'delivery_city' => 'Imus']);
    expect($res->getStatusCode())->not->toBe(200)
        ->and($res->getContent())->toContain("{$this->p->name} is out of stock.")
        ->and(\App\Models\Order::count())->toBe(0);
});
