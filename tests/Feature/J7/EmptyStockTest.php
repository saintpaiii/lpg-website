<?php

use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\User;
use App\Services\PurchaseOrderService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('collected empties of a refill go into empty stock (empty_in); handing them to a supplier on a PO takes them out (empty_out)', function () {
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $p11 = $this->makeProduct($store, 11, 750, 950, 20);
    $hose = $this->makeAccessory($store);
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $store, [[$p11, 2], [$hose, 1]], ['status' => 'out_for_delivery', 'empty_tanks_required' => 2]);
    \App\Models\OrderItem::where('order_id', $order->id)->where('product_id', $hose->id)->update(['transaction_type' => 'new_purchase']);

    $order->fresh()->assertEmptyTanksCollected(true, $owner->id);

    expect((int) Inventory::where('product_id', $p11->id)->value('empty_quantity'))->toBe(2)
        ->and((int) Inventory::where('product_id', $hose->id)->value('empty_quantity'))->toBe(0)
        ->and(InventoryTransaction::where('product_id', $p11->id)->where('type', 'empty_in')->value('quantity'))->toBe(2);

    // Refill PO: 2 filled in, the 2 empties handed to the supplier
    $supplier = $this->makeSupplier($store);
    $this->linkSupplier($supplier, $p11, 680);
    $po = PurchaseOrderService::createDraft($store, $supplier, [['product_id' => $p11->id, 'quantity' => 2, 'unit_cost' => 680]], $owner->id);
    PurchaseOrderService::send($po, $owner);
    $item = $po->items()->first();
    PurchaseOrderService::receive($po->fresh(), [$item->id => ['quantity' => 2, 'requalification_due_on' => now()->addYears(5)->toDateString(), 'empties_sent' => 2]], $owner);

    expect((int) Inventory::where('product_id', $p11->id)->value('empty_quantity'))->toBe(0)
        ->and(InventoryTransaction::where('product_id', $p11->id)->where('type', 'empty_out')->value('quantity'))->toBe(2)
        ->and($item->fresh()->empties_sent)->toBe(2);
});

test('empties a customer had refused at handover after collection are taken back out', function () {
    \Illuminate\Support\Facades\Storage::fake('local');   // the handover photo
    $store = $this->makeStore();
    $p11 = $this->makeProduct($store, 11);
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $store, [[$p11, 2]], ['status' => 'out_for_delivery', 'empty_tanks_required' => 2]);
    $order->fresh()->assertEmptyTanksCollected(true, $store->user_id);
    expect((int) Inventory::where('product_id', $p11->id)->value('empty_quantity'))->toBe(2);

    $item = $order->items()->first();
    $request = \Illuminate\Http\Request::create('/', 'POST', [], [], ['not_accepted' => [0 => ['photo' => $this->jpegUpload()]]]);
    \App\Services\HandoverAdjustmentService::apply($order->fresh(), [['order_item_id' => $item->id, 'quantity' => 1, 'reason' => 'leaking', 'choice' => 'new_purchase']], $request, $store->user_id, 'delivery');

    expect((int) Inventory::where('product_id', $p11->id)->value('empty_quantity'))->toBe(1)
        ->and(InventoryTransaction::where('product_id', $p11->id)->where('type', 'empty_out')->value('notes'))->toContain('stayed with the customer');
});
