<?php

use App\Exceptions\StockUnavailableException;
use App\Models\CylinderBatch;
use App\Models\Inventory;
use App\Models\OrderItemBatch;
use App\Services\StockService;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 0);   // no unbatched stock
    [, $this->customer] = $this->makeCustomer();
});

test('confirm takes the oldest requalification date first, writes order_item_batches, and a cancel returns to the same batches', function () {
    $later  = $this->makeBatch($this->p11, 3, now()->addDays(100)->toDateString());
    $sooner = $this->makeBatch($this->p11, 4, now()->addDays(50)->toDateString());
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 5]], ['status' => 'pending']);

    StockService::takeForOrder($order, $this->store->user_id);

    expect($sooner->fresh()->quantity_remaining)->toBe(0)
        ->and($later->fresh()->quantity_remaining)->toBe(2)
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(2)
        ->and(OrderItemBatch::orderBy('id')->get()->map(fn ($a) => [$a->cylinder_batch_id, $a->quantity])->all())->toBe([[$sooner->id, 4], [$later->id, 1]]);

    StockService::returnForOrder($order, $this->store->user_id, 'cancelled');

    expect($sooner->fresh()->quantity_remaining)->toBe(4)
        ->and($later->fresh()->quantity_remaining)->toBe(3)
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(7)
        ->and(OrderItemBatch::count())->toBe(0);
});

test('an expired batch is never used; only expired left → confirm blocked with the message', function () {
    $expired = $this->makeBatch($this->p11, 2, now()->subDay()->toDateString());
    $good = $this->makeBatch($this->p11, 1, now()->addYear()->toDateString());
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 1]], ['status' => 'pending']);

    expect(StockService::usableFilled($this->p11->id))->toBe(1);
    StockService::takeForOrder($order, $this->store->user_id);
    expect($good->fresh()->quantity_remaining)->toBe(0)->and($expired->fresh()->quantity_remaining)->toBe(2);

    $more = $this->makeOrder($this->customer, $this->store, [[$this->p11, 1]], ['status' => 'pending']);
    expect(fn () => StockService::takeForOrder($more, $this->store->user_id))
        ->toThrow(StockUnavailableException::class, "Only expired cylinders left for {$this->p11->name} — record them as expired or restock.");
});

test('K6: the seller Confirm goes back with the sentence as a red toast (not a 422 error page); JSON callers get a 422 message', function () {
    $this->makeBatch($this->p11, 2, now()->subDay()->toDateString());
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 1]], ['status' => 'pending']);
    $owner = \App\Models\User::find($this->store->user_id);
    $msg = "Only expired cylinders left for {$this->p11->name} — record them as expired or restock.";

    $this->actingAs($owner)->from('/seller/orders')->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])
        ->assertRedirect('/seller/orders')
        ->assertSessionHas('error', $msg);
    expect($order->fresh()->status)->toBe('pending')
        ->and(\App\Models\Invoice::where('order_id', $order->id)->exists())->toBeFalse();   // the confirm transaction rolled back

    $this->actingAs($owner)->patchJson("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])
        ->assertStatus(422)->assertJson(['message' => $msg]);

    // Inertia visit: the same redirect back (not the JSON body)
    $this->actingAs($owner)->from('/seller/orders')->withHeaders(['X-Inertia' => 'true', 'Accept' => 'text/html, application/xhtml+xml'])
        ->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])->assertRedirect('/seller/orders')->assertSessionHas('error', $msg);
});

test('K6: old unbatched stock is the OLDEST — sold first, then batches by requalification date; a cancel returns the same allocation', function () {
    Inventory::where('product_id', $this->p11->id)->update(['quantity' => 3]);   // pre-J7 stock, no batch
    $batch = $this->makeBatch($this->p11, 4, now()->addYear()->toDateString());   // 3 + 4 = 7 filled, 3 undated
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 5]], ['status' => 'pending']);

    StockService::takeForOrder($order, $this->store->user_id);

    expect($batch->fresh()->quantity_remaining)->toBe(2)   // the 3 undated first, then 2 from the batch
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(2)
        ->and(StockService::unbatched($this->p11->id))->toBe(0)
        ->and((int) OrderItemBatch::sum('quantity'))->toBe(2);

    StockService::returnForOrder($order, $this->store->user_id, 'cancelled');
    expect($batch->fresh()->quantity_remaining)->toBe(4)
        ->and(StockService::unbatched($this->p11->id))->toBe(3)
        ->and(OrderItemBatch::count())->toBe(0);
});

test('K6: "Add dates to old stock" turns undated stock into an opening batch — no stock number changes', function () {
    Inventory::where('product_id', $this->p11->id)->update(['quantity' => 6]);
    $owner = \App\Models\User::find($this->store->user_id);
    $due = now()->addYears(3)->toDateString();

    // More than the undated stock → refused
    $this->actingAs($owner)->post("/seller/inventory/{$this->p11->id}/date-old-stock", ['quantity' => 7, 'requalification_due_on' => $due])
        ->assertSessionHasErrors(['quantity' => "You can date at most 6 undated cylinder(s) of {$this->p11->name}."]);
    // The requalification date is required
    $this->actingAs($owner)->post("/seller/inventory/{$this->p11->id}/date-old-stock", ['quantity' => 4])
        ->assertSessionHasErrors('requalification_due_on');

    $this->actingAs($owner)->post("/seller/inventory/{$this->p11->id}/date-old-stock", ['quantity' => 4, 'requalification_due_on' => $due, 'batch_code' => 'OLD-A'])
        ->assertSessionHasNoErrors()->assertSessionHas('success');

    $b = CylinderBatch::where('batch_code', 'OLD-A')->firstOrFail();
    expect($b->source)->toBe('opening')->and($b->quantity_remaining)->toBe(4)->and($b->requalification_due_on->toDateString())->toBe($due)
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(6)   // unchanged
        ->and(StockService::unbatched($this->p11->id))->toBe(2)
        ->and(\App\Models\InventoryTransaction::where('product_id', $this->p11->id)->count())->toBe(0);

    // The Batches drawer shows the rest as "Undated stock"
    $row = \App\Http\Controllers\Seller\InventoryController::row(Inventory::with('product')->where('product_id', $this->p11->id)->first());
    expect($row['undated'])->toBe(2);
});
