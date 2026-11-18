<?php

use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\SupplierReturn;
use App\Models\User;
use App\Services\CylinderService;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 0);
    $this->supplier = $this->makeSupplier($this->store);
    $this->makeBatch($this->p11, 20, now()->addYears(2)->toDateString(), ['supplier_id' => $this->supplier->id]);
    $this->hold = fn (int $qty) => CylinderService::record($this->p11, $qty, 'leaking', null, null, null, false, $this->owner->id);
    $this->inv = fn () => Inventory::where('product_id', $this->p11->id)->first();
});

test('return → replaced: filled +, damaged −, a new batch (source return)', function () {
    $a = ($this->hold)(2);
    $b = ($this->hold)(1);
    expect(($this->inv)()->quantity)->toBe(17)->and(($this->inv)()->damaged_quantity)->toBe(3);

    $this->actingAs($this->owner)->post('/seller/supplier-returns', ['supplier_id' => $this->supplier->id, 'incident_ids' => [$a->id, $b->id]])->assertSessionHasNoErrors();
    $ret = SupplierReturn::firstOrFail();
    expect($ret->return_number)->toBe('RT-000001')->and($a->fresh()->status)->toBe('returned');
    $this->actingAs($this->owner)->get("/seller/supplier-returns/{$ret->id}/slip")->assertOk()->assertHeader('Content-Type', 'application/pdf');

    $this->actingAs($this->owner)->post("/seller/supplier-returns/{$ret->id}/outcome", ['outcome' => 'replaced', 'requalification_due_on' => now()->addYears(5)->toDateString()])
        ->assertSessionHasNoErrors();
    expect(($this->inv)()->quantity)->toBe(20)->and(($this->inv)()->damaged_quantity)->toBe(0)
        ->and($ret->fresh()->status)->toBe('replaced')->and($a->fresh()->status)->toBe('replaced')
        ->and(CylinderBatch::where('source', 'return')->first())->quantity_remaining->toBe(3);
});

test('return → credited: damaged −, amount recorded', function () {
    $a = ($this->hold)(2);
    $ret = CylinderService::createReturn($this->store, $this->supplier, [$a->id], null, $this->owner->id);
    $this->actingAs($this->owner)->post("/seller/supplier-returns/{$ret->id}/outcome", ['outcome' => 'credited', 'credited_amount' => 1360])->assertSessionHasNoErrors();

    expect(($this->inv)()->quantity)->toBe(18)->and(($this->inv)()->damaged_quantity)->toBe(0)
        ->and((float) $ret->fresh()->credited_amount)->toBe(1360.0)->and($a->fresh()->status)->toBe('credited');
});

test('return → rejected: still damaged; then disposed (damaged −, transaction out)', function () {
    $a = ($this->hold)(2);
    $ret = CylinderService::createReturn($this->store, $this->supplier, [$a->id], null, $this->owner->id);
    $this->actingAs($this->owner)->post("/seller/supplier-returns/{$ret->id}/outcome", ['outcome' => 'rejected'])->assertSessionHasNoErrors();
    expect($ret->fresh()->status)->toBe('rejected')->and($a->fresh()->status)->toBe('held')->and(($this->inv)()->damaged_quantity)->toBe(2);

    $this->actingAs($this->owner)->post("/seller/inventory/incidents/{$a->id}/dispose")->assertSessionHasNoErrors();
    expect($a->fresh()->status)->toBe('disposed')->and(($this->inv)()->damaged_quantity)->toBe(0)
        ->and(\App\Models\InventoryTransaction::where('product_id', $this->p11->id)->where('type', 'out')->where('notes', 'like', '%disposed%')->exists())->toBeTrue();
});

test('customer handover incidents cannot be returned to a supplier', function () {
    $x = CylinderIncident::create(['store_id' => $this->store->id, 'product_id' => $this->p11->id, 'quantity' => 1, 'reason' => 'leaking', 'source' => 'customer_handover', 'status' => 'held']);
    $this->actingAs($this->owner)->post('/seller/supplier-returns', ['supplier_id' => $this->supplier->id, 'incident_ids' => [$x->id]])->assertSessionHasErrors('incident_ids');
});
