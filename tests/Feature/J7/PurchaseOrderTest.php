<?php

use App\Mail\PurchaseOrderMail;
use App\Models\CylinderBatch;
use App\Models\Inventory;
use App\Models\PurchaseOrder;
use App\Models\StoreRole;
use App\Models\User;
use App\Services\StoreRoleService;
use Illuminate\Support\Facades\Mail;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 0);
    $this->supplier = $this->makeSupplier($this->store, ['email' => 'orders@petron-supplier.test']);
    $this->linkSupplier($this->supplier, $this->p11, 680);
});

test('create → send by email (PDF attached) → partial receive → receive the rest; cancel blocked after receiving', function () {
    Mail::fake();
    $this->actingAs($this->owner)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 10, 'unit_cost' => 690]]])
        ->assertRedirect();
    $po = PurchaseOrder::firstOrFail();
    expect($po->po_number)->toBe('PO-000001')->and($po->status)->toBe('draft')->and((float) $po->subtotal)->toBe(6900.0);

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/send")->assertSessionHas('success', fn ($m) => str_contains($m, 'emailed'));
    Mail::assertSent(PurchaseOrderMail::class, function (PurchaseOrderMail $m) use ($po) {
        $att = $m->attachments();

        return $m->hasTo('orders@petron-supplier.test') && count($att) === 1 && $att[0]->as === "{$po->po_number}.pdf" && str_starts_with($m->pdf, '%PDF');
    });
    expect($po->fresh()->status)->toBe('sent')->and($po->fresh()->expected_on)->not->toBeNull();

    $item = $po->items()->first();
    $due = now()->addYears(4)->toDateString();
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$item->id => ['quantity' => 4, 'requalification_due_on' => $due, 'batch_code' => 'PET-01']]])
        ->assertSessionHasNoErrors();
    expect($po->fresh()->status)->toBe('partially_received')
        ->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(4)
        ->and(CylinderBatch::where('batch_code', 'PET-01')->first())->quantity_remaining->toBe(4)
        ->and(CylinderBatch::where('batch_code', 'PET-01')->first()->supplier_id)->toBe($this->supplier->id)
        ->and((float) $this->p11->fresh()->cost_price)->toBe(690.0);

    // LPG needs the requalification date
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$item->id => ['quantity' => 6]]])
        ->assertSessionHasErrors("rows.{$item->id}.requalification_due_on");

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$item->id => ['quantity' => 6, 'requalification_due_on' => $due]]])->assertSessionHasNoErrors();
    expect($po->fresh()->status)->toBe('received')->and((int) Inventory::where('product_id', $this->p11->id)->value('quantity'))->toBe(10);

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/cancel")->assertSessionHasErrors('status');
    expect($po->fresh()->status)->toBe('received');
});

test('no supplier email → "Mark as sent"; cancel works before anything is received', function () {
    Mail::fake();
    $this->supplier->update(['email' => null]);
    $this->actingAs($this->owner)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 2, 'unit_cost' => 680]]]);
    $po = PurchaseOrder::firstOrFail();

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/send")->assertSessionHas('success', fn ($m) => str_contains($m, 'marked as sent'));
    Mail::assertNothingSent();
    expect($po->fresh()->status)->toBe('sent');

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/cancel")->assertSessionHasNoErrors();
    expect($po->fresh()->status)->toBe('cancelled');
});

test('PO numbers are per store', function () {
    $other = $this->makeStore();
    $otherSupplier = $this->makeSupplier($other);
    $p = $this->makeProduct($other, 11);
    $this->actingAs($this->owner)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 1, 'unit_cost' => 1]]]);
    $this->actingAs($this->owner)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 1, 'unit_cost' => 1]]]);
    $this->actingAs(User::find($other->user_id))->post('/seller/purchase-orders', ['supplier_id' => $otherSupplier->id, 'lines' => [['product_id' => $p->id, 'quantity' => 1, 'unit_cost' => 1]]]);

    expect(PurchaseOrder::where('store_id', $this->store->id)->orderBy('id')->pluck('po_number')->all())->toBe(['PO-000001', 'PO-000002'])
        ->and(PurchaseOrder::where('store_id', $other->id)->value('po_number'))->toBe('PO-000001');
});

test('Warehouse staff can draft and receive but not send (403)', function () {
    StoreRoleService::seedStarters($this->store);
    $warehouse = $this->makeUser(['name' => 'Pedro Warehouse', 'role' => 'seller_staff', 'sub_role' => 'warehouse', 'store_id' => $this->store->id]);
    StoreRoleService::assign($warehouse, [StoreRole::where('store_id', $this->store->id)->where('starter_key', 'warehouse')->value('id')]);
    $this->clockIn($warehouse, null);   // staff work while clocked in

    $this->actingAs($warehouse)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 3, 'unit_cost' => 680]]])->assertRedirect();
    $po = PurchaseOrder::firstOrFail();

    $this->actingAs($warehouse)->get("/seller/purchase-orders/{$po->id}")->assertOk()->assertInertia(fn ($page) => $page->where('can.send', false)->where('can.receive', true));
    $this->actingAs($warehouse)->postJson("/seller/purchase-orders/{$po->id}/send")->assertForbidden();
    $this->actingAs($warehouse)->post("/seller/purchase-orders/{$po->id}/send")->assertSessionHas('error', fn ($m) => str_contains($m, 'Purchase approvals'));
    expect($po->fresh()->status)->toBe('draft');

    Mail::fake();
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/send");
    $item = $po->items()->first();
    $this->actingAs($warehouse)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$item->id => ['quantity' => 3, 'requalification_due_on' => now()->addYears(3)->toDateString()]]])
        ->assertSessionHasNoErrors();
    expect($po->fresh()->status)->toBe('received');
});
