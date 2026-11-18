<?php

use App\Models\CylinderIncident;
use App\Models\Notification;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderPayment;
use App\Models\User;
use App\Services\CylinderService;
use App\Services\PurchaseOrderService;
use App\Services\SupplierPaymentService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Mail::fake();
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950, 0);
    $this->supplier = $this->makeSupplier($this->store, ['payment_terms' => '7 days']);
    $this->linkSupplier($this->supplier, $this->p11, 830, 1);
    // Ordered 20 × ₱830 = ₱16,600
    $this->po = PurchaseOrderService::createDraft($this->store, $this->supplier, [['product_id' => $this->p11->id, 'quantity' => 20, 'unit_cost' => 830]], $this->owner->id);
    PurchaseOrderService::send($this->po, $this->owner);
    $this->item = $this->po->items()->first();
    $this->receive = fn (int $qty) => PurchaseOrderService::receive($this->po->fresh(), [$this->item->id => ['quantity' => $qty, 'requalification_due_on' => now()->addYears(5)->toDateString()]], $this->owner);
});

test('due date from the payment terms: COD / cash → that day, "N days" → + N, free text → none', function () {
    $d = Carbon::parse('2026-11-18');
    expect(SupplierPaymentService::dueFromTerms('COD', $d))->toBe('2026-11-18')
        ->and(SupplierPaymentService::dueFromTerms('Cash on delivery', $d))->toBe('2026-11-18')
        ->and(SupplierPaymentService::dueFromTerms('7 days', $d))->toBe('2026-11-25')
        ->and(SupplierPaymentService::dueFromTerms('30 Days', $d))->toBe('2026-12-18')
        ->and(SupplierPaymentService::dueFromTerms('1 day', $d))->toBe('2026-11-19')
        ->and(SupplierPaymentService::dueFromTerms('Upon billing, monthly', $d))->toBeNull()
        ->and(SupplierPaymentService::dueFromTerms(null, $d))->toBeNull();
});

test('owed = the RECEIVED value; due date set on the first receive only; partial then full payment → status', function () {
    ($this->receive)(10);   // received ₱8,300 of ₱16,600
    $po = $this->po->fresh('items');
    expect($po->receivedValue())->toBe(8300.0)->and($po->balance())->toBe(8300.0)->and($po->payment_status)->toBe('unpaid')
        ->and($po->payment_due_on->toDateString())->toBe(now()->addDays(7)->toDateString());

    $this->travel(2)->days();
    ($this->receive)(10);   // the rest → owed ₱16,600, due date NOT moved
    $po = $po->fresh('items');
    expect($po->receivedValue())->toBe(16600.0)->and($po->payment_due_on->toDateString())->toBe(now()->subDays(2)->addDays(7)->toDateString());

    $this->actingAs($this->owner)->get("/seller/purchase-orders/{$po->id}")->assertInertia(fn ($page) => $page
        ->where('po.subtotal', 16600)->where('po.received_value', 16600)->where('po.amount_paid', 0)->where('po.balance', 16600)->where('po.payment_status', 'unpaid'));

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/payments", ['amount' => 6600, 'paid_on' => now()->toDateString(), 'method' => 'bank_transfer', 'reference' => 'BDO-1234'])
        ->assertSessionHasNoErrors();
    expect($po->fresh()->payment_status)->toBe('partial')->and((float) $po->fresh()->amount_paid)->toBe(6600.0)->and($po->fresh('items')->balance())->toBe(10000.0);

    // Above the balance → refused
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/payments", ['amount' => 10000.01, 'paid_on' => now()->toDateString(), 'method' => 'cash'])
        ->assertSessionHasErrors(['amount' => 'The amount is more than the balance of ₱10,000.00.']);
    // A future date → refused
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/payments", ['amount' => 100, 'paid_on' => now()->addDay()->toDateString(), 'method' => 'cash'])
        ->assertSessionHasErrors(['paid_on' => "The payment date can't be in the future."]);

    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$po->id}/payments", ['amount' => 10000, 'paid_on' => now()->toDateString(), 'method' => 'check', 'reference' => 'CHK 000981'])
        ->assertSessionHasNoErrors();
    expect($po->fresh()->payment_status)->toBe('paid')->and($po->fresh('items')->balance())->toBe(0.0)
        ->and(PurchaseOrderPayment::where('purchase_order_id', $po->id)->count())->toBe(2);
});

test('deleting a payment (owner only) recomputes the status; overdue flag; the list filter + summary', function () {
    ($this->receive)(20);
    $po = $this->po->fresh('items');
    $pay = SupplierPaymentService::record($po, ['amount' => 16600, 'paid_on' => now()->toDateString(), 'method' => 'cash'], $this->owner->id);
    expect($po->fresh()->payment_status)->toBe('paid');

    $this->actingAs($this->owner)->delete("/seller/purchase-orders/{$po->id}/payments/{$pay->id}")->assertSessionHasNoErrors()->assertSessionHas('success');
    expect($po->fresh()->payment_status)->toBe('unpaid')->and((float) $po->fresh()->amount_paid)->toBe(0.0);

    // Not overdue yet (due in 7 days); past the due date → overdue
    expect($po->fresh('items')->isOverdue())->toBeFalse();
    $this->travel(8)->days();
    expect($po->fresh('items')->isOverdue())->toBeTrue();

    $this->actingAs($this->owner)->get('/seller/purchase-orders?tab=unpaid')->assertInertia(fn ($page) => $page
        ->where('tab', 'unpaid')->where('orders.data.0.id', $po->id)->where('orders.data.0.overdue', true)->where('orders.data.0.payment_label', 'Unpaid')
        ->where('counts.unpaid', 1)->where('payables.owed', 16600)->where('payables.overdue_count', 1));

    // The supplier card + the DSS table show the balance
    $this->actingAs($this->owner)->get('/seller/suppliers')->assertInertia(fn ($page) => $page->where("balances.{$this->supplier->id}.owed", 16600)->where("balances.{$this->supplier->id}.overdue", 16600));
    $dss = \App\Services\SupplierDssService::forStore($this->store->fresh());
    expect(collect($dss['suppliers'])->firstWhere('id', $this->supplier->id))->toMatchArray(['owed' => 16600.0, 'overdue' => 16600.0]);

    // The PDF shows the due date
    expect(view('pdf.purchase-order', ['po' => $po->fresh(['supplier', 'items.product', 'store', 'creator']), 'store' => $this->store, 'logo' => null])->render())
        ->toContain('Payment terms: 7 days')->toContain('Due: ' . $po->fresh()->payment_due_on->format('M j, Y'));
});

test('nothing received yet → no payment possible; due date can be set by hand when the terms are free text', function () {
    $this->actingAs($this->owner)->post("/seller/purchase-orders/{$this->po->id}/payments", ['amount' => 100, 'paid_on' => now()->toDateString(), 'method' => 'cash'])
        ->assertSessionHasErrors(['amount' => "Nothing was received on {$this->po->po_number} yet — you pay for what arrived."]);

    $this->supplier->update(['payment_terms' => 'Every 15th of the month']);
    ($this->receive)(5);
    expect($this->po->fresh()->payment_due_on)->toBeNull();
    $this->actingAs($this->owner)->patch("/seller/purchase-orders/{$this->po->id}/due-date", ['payment_due_on' => '2026-12-15'])->assertSessionHasNoErrors();
    expect($this->po->fresh()->payment_due_on->toDateString())->toBe('2026-12-15');
});

test('warehouse can\'t record or delete payments; the page hides the buttons', function () {
    ($this->receive)(20);
    $warehouse = $this->makeWarehouse($this->store);
    $po = $this->po->fresh();

    $this->actingAs($warehouse)->get("/seller/purchase-orders/{$po->id}")->assertOk()->assertInertia(fn ($page) => $page->where('can.pay', false)->where('can.owner', false));
    $this->actingAs($warehouse)->postJson("/seller/purchase-orders/{$po->id}/payments", ['amount' => 100, 'paid_on' => now()->toDateString(), 'method' => 'cash'])->assertForbidden();
    $this->actingAs($warehouse)->post("/seller/purchase-orders/{$po->id}/payments", ['amount' => 100, 'paid_on' => now()->toDateString(), 'method' => 'cash'])
        ->assertSessionHas('error', 'Only the owner or someone with Purchase approvals can record supplier payments.');
    $pay = SupplierPaymentService::record($po, ['amount' => 100, 'paid_on' => now()->toDateString(), 'method' => 'cash'], $this->owner->id);
    $this->actingAs($warehouse)->deleteJson("/seller/purchase-orders/{$po->id}/payments/{$pay->id}")->assertForbidden();
    expect(PurchaseOrderPayment::count())->toBe(1);
});

test('a supplier-return credit is recorded as a payment on the oldest unpaid PO ("Credit RT-000001"); the rest stays not applied', function () {
    ($this->receive)(2);   // owes ₱1,660
    $incident = CylinderIncident::create(['store_id' => $this->store->id, 'product_id' => $this->p11->id, 'supplier_id' => $this->supplier->id, 'quantity' => 1,
        'reason' => 'leaking', 'source' => 'stock_check', 'status' => 'held', 'recorded_by' => $this->owner->id]);
    \App\Models\Inventory::where('product_id', $this->p11->id)->update(['damaged_quantity' => 1, 'quantity' => 1]);
    $return = CylinderService::createReturn($this->store, $this->supplier, [$incident->id], null, $this->owner->id);

    CylinderService::outcome($return, 'credited', ['credited_amount' => 2000], $this->owner->id);

    $pay = PurchaseOrderPayment::where('supplier_return_id', $return->id)->firstOrFail();
    expect((float) $pay->amount)->toBe(1660.0)->and($pay->method)->toBe('other')->and($pay->note)->toBe("Credit {$return->return_number}")
        ->and($this->po->fresh()->payment_status)->toBe('paid')
        ->and(SupplierPaymentService::creditApplied($return))->toBe(1660.0);   // ₱340 shown as not applied on the return
});

test('daily reminders: due tomorrow and overdue → ONE notification to the owner per PO per kind', function () {
    ($this->receive)(20);   // due in 7 days
    $this->travel(6)->days();   // due tomorrow
    $this->artisan('purchase-orders:payment-reminders')->assertSuccessful();
    $this->artisan('purchase-orders:payment-reminders')->assertSuccessful();
    expect(Notification::where('user_id', $this->owner->id)->where('title', "Supplier payment due tomorrow: {$this->po->po_number}")->count())->toBe(1);

    $this->travel(3)->days();   // overdue
    $this->artisan('purchase-orders:payment-reminders')->assertSuccessful();
    $this->artisan('purchase-orders:payment-reminders')->assertSuccessful();
    expect(Notification::where('user_id', $this->owner->id)->where('title', "Supplier payment overdue: {$this->po->po_number}")->count())->toBe(1);

    // Paid → nothing more
    SupplierPaymentService::record($this->po->fresh(), ['amount' => 16600, 'paid_on' => now()->toDateString(), 'method' => 'cash'], $this->owner->id);
    expect(SupplierPaymentService::sendReminders())->toBe(0);
});

test('12: suppliers are owner-only — warehouse gets 403 / a toast, sees the page read-only, and can still draft and receive', function () {
    $warehouse = $this->makeWarehouse($this->store);

    $this->actingAs($warehouse)->postJson('/seller/suppliers', ['name' => 'Sneaky Supplier', 'lead_time_days' => 2])->assertForbidden();
    $this->actingAs($warehouse)->post('/seller/suppliers', ['name' => 'Sneaky Supplier', 'lead_time_days' => 2])
        ->assertSessionHas('error', 'Only the owner or someone with Purchase approvals can add or change suppliers.');
    $this->actingAs($warehouse)->putJson("/seller/suppliers/{$this->supplier->id}", ['name' => 'X', 'lead_time_days' => 1])->assertForbidden();
    $this->actingAs($warehouse)->postJson("/seller/suppliers/{$this->supplier->id}/products", ['product_id' => $this->p11->id, 'unit_cost' => 1, 'min_order_qty' => 1])->assertForbidden();
    expect(\App\Models\Supplier::where('name', 'Sneaky Supplier')->exists())->toBeFalse()
        ->and(\App\Services\StaffAccess::can($warehouse, 'inventory.suppliers'))->toBeFalse();

    $this->actingAs($warehouse)->get('/seller/suppliers')->assertOk()->assertInertia(fn ($page) => $page->where('canManage', false)->where('suppliers.0.products.0.unit_cost', 830));
    $this->actingAs($this->owner)->get('/seller/suppliers')->assertInertia(fn ($page) => $page->where('canManage', true));
    $this->actingAs($this->owner)->post('/seller/suppliers', ['name' => 'Gasul Depot', 'lead_time_days' => 2])->assertSessionHasNoErrors();
    expect(\App\Models\Supplier::where('name', 'Gasul Depot')->exists())->toBeTrue();

    // Still: drafts and receiving
    $this->actingAs($warehouse)->post('/seller/purchase-orders', ['supplier_id' => $this->supplier->id, 'lines' => [['product_id' => $this->p11->id, 'quantity' => 3, 'unit_cost' => 830]]])
        ->assertSessionHasNoErrors()->assertRedirect();
    $this->actingAs($warehouse)->post("/seller/purchase-orders/{$this->po->id}/receive", ['rows' => [$this->item->id => ['quantity' => 2, 'requalification_due_on' => now()->addYears(4)->toDateString()]]])
        ->assertSessionHasNoErrors();
    expect($this->po->fresh()->status)->toBe('partially_received');
});
