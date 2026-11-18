<?php

use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PurchaseOrder;
use App\Services\ReorderService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('the formula: Sold 3.2/day · lead 2 days · safety 7 → reorder at 14; you have 9 → order 45', function () {
    $r = ReorderService::compute(3.2, 2, 9, 0, 5, 10);
    expect($r)->toMatchArray(['safety_stock' => 7, 'reorder_point' => 14, 'suggested_qty' => 45, 'due' => true])
        ->and($r['text'])->toBe('Sold 3.2/day · lead 2 days · safety 7 → reorder at 14; you have 9 → order 45');

    // A higher manual reorder level wins; stock on order counts
    expect(ReorderService::compute(3.2, 2, 9, 0, 1, 20)['reorder_point'])->toBe(20)
        ->and(ReorderService::compute(3.2, 2, 9, 10, 1, 0)['due'])->toBeFalse();
});

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 9);
    $this->p22 = $this->makeProduct($this->store, 22, 1400, 1800, 50);
    $this->supplier = $this->makeSupplier($this->store, ['lead_time_days' => 2]);
    $this->linkSupplier($this->supplier, $this->p11, 680, 5);
    $this->linkSupplier($this->supplier, $this->p22, 1300, 1);
    // 96 × 11 kg sold in the last 30 days → 3.2/day
    [, $customer] = $this->makeCustomer();
    foreach (range(1, 8) as $i) {
        $o = $this->makeOrder($customer, $this->store, [[$this->p11, 12]], ['status' => 'delivered']);
        Order::whereKey($o->id)->update(['created_at' => now()->subDays($i)]);
    }
});

test('forProduct uses the real sales history and the preferred supplier', function () {
    $r = ReorderService::forProduct($this->p11->fresh());
    expect($r['avg_daily'])->toBe(3.2)->and($r['lead'])->toBe(2)->and($r['reorder_point'])->toBe(14)
        ->and($r['usable'])->toBe(9)->and($r['suggested_qty'])->toBe(45)->and($r['supplier_name'])->toBe($this->supplier->name);
});

test('one auto draft per supplier; lines updated not duplicated; never sent', function () {
    $po = ReorderService::checkProduct($this->p11->fresh());
    expect($po->status)->toBe('draft')->and($po->source)->toBe('auto')->and($po->items)->toHaveCount(1)
        ->and($po->items->first()->quantity_ordered)->toBe(45)->and($po->sent_at)->toBeNull();

    // Stock drops more → same draft, same line, new quantity
    Inventory::where('product_id', $this->p11->id)->update(['quantity' => 4]);
    ReorderService::checkProduct($this->p11->fresh());
    ReorderService::checkStore($this->store->fresh());
    expect(PurchaseOrder::count())->toBe(1)
        ->and($po->fresh()->items)->toHaveCount(1)
        ->and($po->fresh()->items->first()->quantity_ordered)->toBe(50)   // 45 + 7 − 4 = 48 → rounded up to the min of 5
        ->and($po->fresh()->status)->toBe('draft');

    // The other product of the same supplier joins the SAME draft when it drops
    Inventory::where('product_id', $this->p22->id)->update(['quantity' => 0]);
    OrderItem::create(['order_id' => Order::first()->id, 'product_id' => $this->p22->id, 'quantity' => 30, 'unit_price' => 1400, 'subtotal' => 42000, 'transaction_type' => 'refill']);
    ReorderService::checkStore($this->store->fresh());
    expect(PurchaseOrder::count())->toBe(1)->and($po->fresh()->items)->toHaveCount(2);

    // The owner was told it's ready for review
    expect(\App\Models\Notification::where('user_id', $this->store->user_id)->where('message', 'like', '%is ready for review%')->exists())->toBeTrue();
});

test('setting off → no draft; an excluded product is skipped', function () {
    $this->store->update(['auto_reorder_enabled' => false]);
    expect(ReorderService::checkProduct($this->p11->fresh()))->toBeNull()->and(PurchaseOrder::count())->toBe(0);

    $this->store->update(['auto_reorder_enabled' => true]);
    $this->p11->update(['exclude_auto_reorder' => true]);
    expect(ReorderService::checkProduct($this->p11->fresh()))->toBeNull();
    ReorderService::checkStore($this->store->fresh());
    expect(PurchaseOrder::count())->toBe(0);
});

test('confirming an order triggers the check (draft created after the stock went down)', function () {
    Inventory::where('product_id', $this->p11->id)->update(['quantity' => 20]);
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $this->store, [[$this->p11, 6]], ['status' => 'pending']);
    $this->actingAs(\App\Models\User::find($this->store->user_id))->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])->assertSessionHasNoErrors();

    expect(PurchaseOrder::where('source', 'auto')->count())->toBe(1);
});
