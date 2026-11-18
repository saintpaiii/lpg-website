<?php

use App\Models\Inventory;
use App\Models\OrderItemBatch;
use App\Services\StockService;
use Symfony\Component\HttpKernel\Exception\HttpException;

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
        ->toThrow(HttpException::class, "Only expired cylinders left for {$this->p11->name} — record them as expired or restock.");
});

test('the seller Confirm button shows the expired-only message', function () {
    $this->makeBatch($this->p11, 2, now()->subDay()->toDateString());
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 1]], ['status' => 'pending']);
    $owner = \App\Models\User::find($this->store->user_id);

    $res = $this->actingAs($owner)->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed']);
    expect($res->getStatusCode())->toBe(422)
        ->and($res->getContent())->toContain('Only expired cylinders left')
        ->and($order->fresh()->status)->toBe('pending');
});

test('old unbatched stock still sells (batches first, the rest unbatched)', function () {
    Inventory::where('product_id', $this->p11->id)->update(['quantity' => 5]);   // pre-J7 stock, no batch
    $batch = $this->makeBatch($this->p11, 2, now()->addYear()->toDateString());
    $order = $this->makeOrder($this->customer, $this->store, [[$this->p11, 4]], ['status' => 'pending']);

    StockService::takeForOrder($order, $this->store->user_id);

    expect($batch->fresh()->quantity_remaining)->toBe(0)
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(3)
        ->and((int) OrderItemBatch::sum('quantity'))->toBe(2);
});
