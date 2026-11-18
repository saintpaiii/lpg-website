<?php

use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\User;
use App\Services\HandoverAdjustmentService;
use App\Services\SupplierDssService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Storage::fake('local');
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 0);
    $this->supplier = $this->makeSupplier($this->store);
    $this->batch = $this->makeBatch($this->p11, 10, now()->addYears(2)->toDateString(), ['supplier_id' => $this->supplier->id]);
});

test('recording damaged cylinders: filled −, damaged +, batch −, incident held (with a private photo)', function () {
    $this->actingAs($this->owner)->post("/seller/inventory/{$this->p11->id}/damaged", [
        'quantity' => 2, 'reason' => 'leaking', 'note' => 'Hissing at the valve', 'photo' => $this->jpegUpload(),
    ])->assertSessionHasNoErrors();

    $inv = Inventory::where('product_id', $this->p11->id)->first();
    $incident = CylinderIncident::firstOrFail();
    expect($inv->quantity)->toBe(8)->and($inv->damaged_quantity)->toBe(2)
        ->and($this->batch->fresh()->quantity_remaining)->toBe(8)
        ->and($incident->status)->toBe('held')->and($incident->source)->toBe('stock_check')
        ->and($incident->supplier_id)->toBe($this->supplier->id)->and($incident->cylinder_batch_id)->toBe($this->batch->id)
        ->and(Storage::disk('local')->exists($incident->photo_path))->toBeTrue()
        ->and(InventoryTransaction::where('product_id', $this->p11->id)->where('type', 'damaged')->value('quantity'))->toBe(2);

    $this->actingAs($this->owner)->get("/documents/cylinder-incident/{$incident->id}/photo_path")->assertOk();
    [$stranger] = $this->makeCustomer();
    $this->actingAs($stranger)->get("/documents/cylinder-incident/{$incident->id}/photo_path")->assertForbidden();
});

test('an EMPTY damaged cylinder comes out of the empties, not the filled stock', function () {
    Inventory::where('product_id', $this->p11->id)->update(['empty_quantity' => 3]);
    $this->actingAs($this->owner)->post("/seller/inventory/{$this->p11->id}/damaged", ['quantity' => 1, 'reason' => 'dented_rusty', 'was_empty' => 1])->assertSessionHasNoErrors();

    $inv = Inventory::where('product_id', $this->p11->id)->first();
    expect($inv->quantity)->toBe(10)->and($inv->empty_quantity)->toBe(2)->and($inv->damaged_quantity)->toBe(1)
        ->and($this->batch->fresh()->quantity_remaining)->toBe(10);
});

test('a J4 handover bad tank → a customer_handover incident, NO stock number changes, not in the supplier damage rate', function () {
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $this->store, [[$this->p11, 2]], ['status' => 'out_for_delivery', 'empty_tanks_required' => 2]);
    $before = Inventory::where('product_id', $this->p11->id)->first()->only(['quantity', 'empty_quantity', 'damaged_quantity']);
    $batchBefore = $this->batch->fresh()->quantity_remaining;

    // "Switch to New Purchase": the customer keeps their bad empty and buys a filled tank — the store keeps nothing
    $item = $order->items()->first();
    $request = Request::create('/', 'POST', [], [], ['not_accepted' => [0 => ['photo' => $this->jpegUpload()]]]);
    HandoverAdjustmentService::apply($order, [['order_item_id' => $item->id, 'quantity' => 1, 'reason' => 'leaking', 'choice' => 'new_purchase']], $request, $this->owner->id, 'delivery');

    $incident = CylinderIncident::firstOrFail();
    expect($incident->source)->toBe('customer_handover')->and($incident->status)->toBe('disposed')
        ->and($incident->reason)->toBe('leaking')->and($incident->supplier_id)->toBeNull()
        ->and($incident->order_id)->toBe($order->id)->and($incident->order_item_adjustment_id)->not->toBeNull()
        ->and(Inventory::where('product_id', $this->p11->id)->first()->only(['quantity', 'empty_quantity', 'damaged_quantity']))->toBe($before)
        ->and($this->batch->fresh()->quantity_remaining)->toBe($batchBefore);

    // Supplier damage rate ignores it; the DSS shows it as its own stat
    $this->batch->forceFill(['source' => 'po', 'quantity_received' => 50])->save();
    $dss = SupplierDssService::forStore($this->store->fresh());
    expect(collect($dss['suppliers'])->firstWhere('id', $this->supplier->id)['damaged'])->toBe(0)
        ->and($dss['handover']['text'])->toBe('Customer tanks rejected at handover (90 days): 1, mostly leaking ' . $this->p11->name);
});
