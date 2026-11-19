<?php

use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\StockTransfer;
use App\Models\StockTransferItemBatch;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

beforeEach(function () {
    $this->main = $this->makeStore();
    $this->owner = $this->ownerOf($this->main);
    $this->branch = $this->makeBranch($this->main);
    // Main: 5 undated (pre-J7) + expired batch A (5) + batch B (10, due in 200 days) + batch C (10, due in 400 days) = 30; usable 25
    $this->pm = $this->makeProduct($this->main, 11, stock: 5);
    $this->A = $this->makeBatch($this->pm, 5, now()->subDay()->toDateString());
    $this->B = $this->makeBatch($this->pm, 10, now()->addDays(200)->toDateString(), ['manufactured_on' => '2020-03-01']);
    $this->C = $this->makeBatch($this->pm, 10, now()->addDays(400)->toDateString(), ['manufactured_on' => '2021-06-01']);
    $this->pb = $this->makeProduct($this->branch, 11, stock: 0);
    $this->send = fn (int $qty, array $extra = []) => $this->actingAs($this->owner)->post('/seller/transfers', [
        'from_store_id' => $this->main->id, 'to_store_id' => $this->branch->id,
        'lines' => [['from_product_id' => $this->pm->id, 'to_product_id' => $this->pb->id, 'quantity' => $qty]],
    ] + $extra);
});

test('send takes usable stock in sale order (undated first, then the earliest requalification date; never expired)', function () {
    ($this->send)(17)->assertSessionHasNoErrors()->assertSessionHas('success');

    $t = StockTransfer::firstOrFail();
    expect($t->transfer_number)->toBe('TR-000001')->and($t->status)->toBe('sent')->and($t->owner_id)->toBe($this->owner->id);
    expect((int) Inventory::where('product_id', $this->pm->id)->value('quantity'))->toBe(13)
        ->and($this->A->fresh()->quantity_remaining)->toBe(5)          // expired: untouched
        ->and($this->B->fresh()->quantity_remaining)->toBe(0)
        ->and($this->C->fresh()->quantity_remaining)->toBe(8);
    expect(StockTransferItemBatch::pluck('quantity', 'cylinder_batch_id')->all())->toEqual([$this->B->id => 10, $this->C->id => 2]);
    expect(InventoryTransaction::where('product_id', $this->pm->id)->where('type', 'transfer_out')->where('reference', 'TR-000001')->value('quantity'))->toBe(17);
    expect(\App\Models\Notification::where('title', 'Stock transfer on the way')->exists())->toBeTrue();
});

test("can't send more than usable stock (expired cylinders never count)", function () {
    ($this->send)(26)->assertSessionHasErrors(['lines.0.quantity' => 'Only 25 usable 11kg LPG in stock.']);
    expect(StockTransfer::count())->toBe(0)->and((int) Inventory::where('product_id', $this->pm->id)->value('quantity'))->toBe(30);
});

test('receive: same dates in the destination (undated stays undated); a shortfall → a "lost in transfer" incident at the source', function () {
    ($this->send)(17);
    $t = StockTransfer::with('items')->firstOrFail();
    $item = $t->items->first();

    // Received 15 of 17: the 5 undated + batch B's 10 arrive, 2 of batch C are missing
    $this->actingAs($this->owner)->post("/seller/transfers/{$t->id}/receive", ['received' => [$item->id => 15]])->assertSessionHas('warning');

    expect($t->fresh()->status)->toBe('received')->and($item->fresh()->quantity_received)->toBe(15);
    expect((int) Inventory::where('product_id', $this->pb->id)->value('quantity'))->toBe(15);
    $dest = CylinderBatch::where('product_id', $this->pb->id)->get();
    expect($dest)->toHaveCount(1)
        ->and($dest[0]->quantity_remaining)->toBe(10)->and($dest[0]->source)->toBe('transfer')
        ->and($dest[0]->requalification_due_on->toDateString())->toBe($this->B->requalification_due_on->toDateString())
        ->and($dest[0]->manufactured_on->toDateString())->toBe('2020-03-01')
        ->and(\App\Services\StockService::unbatched($this->pb->id))->toBe(5);          // undated stays undated
    $inc = CylinderIncident::firstOrFail();
    expect($inc->store_id)->toBe($this->main->id)->and($inc->quantity)->toBe(2)->and($inc->reason)->toBe('other')
        ->and($inc->cylinder_batch_id)->toBe($this->C->id)->and($inc->note)->toContain('Lost in transfer TR-000001');
    expect(InventoryTransaction::where('product_id', $this->pb->id)->where('type', 'transfer_in')->value('quantity'))->toBe(15);

    // Can't receive twice
    $this->actingAs($this->owner)->post("/seller/transfers/{$t->id}/receive", ['received' => [$item->id => 15]])->assertSessionHasErrors('transfer');
});

test('cancel (only while sent) puts everything back into the same source batches', function () {
    ($this->send)(17);
    $t = StockTransfer::firstOrFail();
    $this->actingAs($this->owner)->post("/seller/transfers/{$t->id}/cancel")->assertSessionHas('success');

    expect($t->fresh()->status)->toBe('cancelled')
        ->and((int) Inventory::where('product_id', $this->pm->id)->value('quantity'))->toBe(30)
        ->and($this->B->fresh()->quantity_remaining)->toBe(10)->and($this->C->fresh()->quantity_remaining)->toBe(10)
        ->and((int) Inventory::where('product_id', $this->pb->id)->value('quantity'))->toBe(0);
    $this->actingAs($this->owner)->post("/seller/transfers/{$t->id}/cancel")->assertSessionHasErrors('transfer');
});

test("can't transfer to another owner's store; the trial / a lapsed Premium main store can't send", function () {
    $other = $this->makeStore();
    $op = $this->makeProduct($other, 11, stock: 0);
    $this->actingAs($this->owner)->post('/seller/transfers', [
        'from_store_id' => $this->main->id, 'to_store_id' => $other->id,
        'lines' => [['from_product_id' => $this->pm->id, 'to_product_id' => $op->id, 'quantity' => 1]],
    ])->assertSessionHasErrors('to_store_id');

    $this->main->forceFill(['subscription_plan' => 'trial'])->save();
    ($this->send)(1)->assertRedirect()->assertSessionHas('error', fn ($m) => str_contains($m, 'paid Premium'));
    expect(StockTransfer::count())->toBe(0);
});

test('empties can be transferred; a source-store warehouse with inventory.transfer can send, the destination\'s staff receive', function () {
    Inventory::where('product_id', $this->pm->id)->update(['empty_quantity' => 8]);
    $wh = $this->makeWarehouse($this->main);
    $this->actingAs($wh)->post('/seller/transfers', [
        'from_store_id' => $this->main->id, 'to_store_id' => $this->branch->id,
        'lines' => [['from_product_id' => $this->pm->id, 'to_product_id' => $this->pb->id, 'quantity' => 6, 'empties' => 1]],
    ])->assertSessionHasNoErrors();
    expect((int) Inventory::where('product_id', $this->pm->id)->value('empty_quantity'))->toBe(2)
        ->and((int) Inventory::where('product_id', $this->pm->id)->value('quantity'))->toBe(30);

    $bm = $this->makeBranchManager($this->branch);
    $t = StockTransfer::firstOrFail();
    $this->actingAs($bm)->post("/seller/transfers/{$t->id}/receive")->assertSessionHasNoErrors();
    expect((int) Inventory::where('product_id', $this->pb->id)->value('empty_quantity'))->toBe(6);
    // The slip PDF
    $this->actingAs($this->owner)->get("/seller/transfers/{$t->id}/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
});
