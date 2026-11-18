<?php

use App\Models\Inventory;
use App\Models\PurchaseOrder;
use App\Models\User;
use App\Services\PurchaseOrderService;
use App\Services\ReorderService;
use Illuminate\Support\Facades\Mail;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('6: the regulator case — reorder level 5, stock 4, 0.1/day → order up to 7 → order 3; with min 10 → 10; received → no re-trigger', function () {
    $r = ReorderService::compute(0.1, 3, 4, 0, 1, 5);
    expect($r)->toMatchArray(['safety_stock' => 1, 'reorder_point' => 5, 'point_source' => 'manual', 'target_stock' => 7, 'suggested_qty' => 3, 'due' => true])
        ->and($r['text'])->toBe('Sold 0.1/day · lead 3 days · safety 1 → reorder at 5 (your reorder level), order up to 7; you have 4 → order 3');

    expect(ReorderService::compute(0.1, 3, 4, 0, 10, 5)['suggested_qty'])->toBe(10);

    // After receiving the 3: usable 7 > reorder point 5 → not due any more
    $after = ReorderService::compute(0.1, 3, 4 + 3, 0, 1, 5);
    expect($after['due'])->toBeFalse()->and($after['usable'])->toBeGreaterThan($after['reorder_point']);
    // No sales at all still orders at least 1 above the reorder point
    expect(ReorderService::compute(0.0, 2, 5, 0, 1, 5)['suggested_qty'])->toBe(1);
});

test('6: real data — the auto draft gets 3, is updated (not duplicated), and after receiving it the product is above its reorder point', function () {
    Mail::fake();
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $reg = $this->makeAccessory($store, 'LPG Regulator', 450, 0.5, 4);
    Inventory::where('product_id', $reg->id)->update(['reorder_level' => 5]);
    $supplier = $this->makeSupplier($store, ['lead_time_days' => 3]);
    $this->linkSupplier($supplier, $reg, 300, 1);
    [, $customer] = $this->makeCustomer();
    $this->makeOrder($customer, $store, [[$reg, 3]], ['status' => 'delivered']);   // 3 in 30 days = 0.1/day

    $po = ReorderService::checkProduct($reg->fresh());
    expect($po->items->first()->quantity_ordered)->toBe(3);

    Inventory::where('product_id', $reg->id)->update(['quantity' => 3]);
    ReorderService::checkProduct($reg->fresh());
    expect(PurchaseOrder::count())->toBe(1)->and($po->fresh()->items)->toHaveCount(1)->and($po->fresh()->items->first()->quantity_ordered)->toBe(4);

    PurchaseOrderService::send($po->fresh(), $owner);
    $item = $po->items()->first();
    PurchaseOrderService::receive($po->fresh(), [$item->id => ['quantity' => 4]], $owner);

    $calc = ReorderService::forProduct($reg->fresh());
    expect($calc['usable'])->toBe(7)->and($calc['due'])->toBeFalse();
    expect(ReorderService::checkProduct($reg->fresh()))->toBeNull()->and(PurchaseOrder::count())->toBe(1);
});

test('7: a draft below the supplier minimum can be saved but not sent; at the minimum it sends', function () {
    Mail::fake();
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $p11 = $this->makeProduct($store, 11, 750, 950, 0);
    $supplier = $this->makeSupplier($store);
    $this->linkSupplier($supplier, $p11, 690, 10);

    $this->actingAs($owner)->post('/seller/purchase-orders', ['supplier_id' => $supplier->id, 'lines' => [['product_id' => $p11->id, 'quantity' => 5, 'unit_cost' => 690]]])
        ->assertSessionHasNoErrors();
    $po = PurchaseOrder::firstOrFail();

    $this->actingAs($owner)->get("/seller/purchase-orders/{$po->id}")
        ->assertInertia(fn ($page) => $page->where('po.below_minimum.0', "{$p11->name}: minimum order from this supplier is 10.")->where('po.items.0.min_order_qty', 10));

    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/send")
        ->assertSessionHasErrors(['lines' => "{$p11->name}: the minimum order from {$supplier->name} is 10 (this PO has 5)."]);
    expect($po->fresh()->status)->toBe('draft');
    Mail::assertNothingSent();

    $this->actingAs($owner)->put("/seller/purchase-orders/{$po->id}", ['lines' => [['product_id' => $p11->id, 'quantity' => 10, 'unit_cost' => 690]]])->assertSessionHasNoErrors();
    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/send")->assertSessionHasNoErrors();
    expect($po->fresh()->status)->toBe('sent');
});

test('2 + 11: friendly date messages on receive; a fully received line refuses more', function () {
    Mail::fake();
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $p11 = $this->makeProduct($store, 11, 750, 950, 0);
    $p22 = $this->makeProduct($store, 22, 1400, 1800, 0);
    $supplier = $this->makeSupplier($store);
    $po = PurchaseOrderService::createDraft($store, $supplier, [['product_id' => $p11->id, 'quantity' => 2, 'unit_cost' => 690], ['product_id' => $p22->id, 'quantity' => 2, 'unit_cost' => 1300]], $owner->id);
    PurchaseOrderService::send($po, $owner);
    [$a, $b] = $po->items()->orderBy('id')->get()->all();
    $due = now()->addYears(4)->toDateString();

    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$a->id => ['quantity' => 2, 'requalification_due_on' => $due, 'manufactured_on' => now()->addDay()->toDateString()]]])
        ->assertSessionHasErrors(["rows.{$a->id}.manufactured_on" => "Manufactured date can't be in the future."]);
    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$a->id => ['quantity' => 2, 'requalification_due_on' => now()->addDays(10)->toDateString(), 'manufactured_on' => now()->toDateString()]]])
        ->assertSessionHasNoErrors();   // today is fine
    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$b->id => ['quantity' => 1, 'requalification_due_on' => now()->addDays(5)->toDateString(), 'manufactured_on' => now()->toDateString()]]])
        ->assertSessionHasNoErrors();

    // Manufactured on/after the requalification date (same check in Stock In)
    $this->actingAs($owner)->post("/seller/inventory/{$p11->id}/stock-in", ['quantity' => 1, 'requalification_due_on' => now()->addDays(3)->toDateString(), 'manufactured_on' => now()->toDateString()])
        ->assertSessionHasNoErrors();
    expect(fn () => \App\Services\StockService::checkBatchDates(['manufactured_on' => '2026-01-10', 'requalification_due_on' => '2026-01-10']))
        ->toThrow(\Illuminate\Validation\ValidationException::class, 'Manufactured date must be before the requalification date.');

    // Line A is fully received → more is refused; the page only offers line B
    $this->actingAs($owner)->post("/seller/purchase-orders/{$po->id}/receive", ['rows' => [$a->id => ['quantity' => 1, 'requalification_due_on' => $due]]])
        ->assertSessionHasErrors(["rows.{$a->id}.quantity" => "Only 0 left to receive for {$p11->name}."]);
    $this->actingAs($owner)->get("/seller/purchase-orders/{$po->id}")
        ->assertInertia(fn ($page) => $page->where('po.items.0.remaining', 0)->where('po.items.1.remaining', 1));
});

test('9: the DSS lists already-expired batches first with a link to the Batches drawer', function () {
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 2.7, 300, 380, 0);
    $p->update(['name' => '2.7kg Handy Gas']);
    $b = $this->makeBatch($p, 5, now()->subDays(17)->toDateString(), ['batch_code' => 'OLD-EXP']);

    $dss = \App\Services\SupplierDssService::forStore($store->fresh());
    expect($dss['expired'])->toHaveCount(1)
        ->and($dss['expired'][0]['text'])->toBe('5 cylinder(s) already expired (batch OLD-EXP, 2.7kg Handy Gas) — mark them as expired and return them.')
        ->and($dss['expired'][0]['link'])->toBe("/seller/inventory?batches={$p->id}")
        ->and($dss['expiry'])->toBeNull();   // the "within 30 days" line is only for batches not expired yet
});
