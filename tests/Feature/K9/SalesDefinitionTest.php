<?php

use App\Models\Notification;
use App\Models\User;
use App\Services\MainDashboardService;
use App\Services\RevenueService;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

test('one order with a delivery fee → the SAME sales total on the Dashboard, Revenue, Reports and the Main dashboard', function () {
    $store = $this->makeStore();
    $owner = $this->ownerOf($store);
    $this->makeBranch($store);
    $p = $this->makeProduct($store, 11, 920, 1200);
    [, $c] = $this->makeCustomer();
    // ₱1,840 items + ₱85 delivery = ₱1,925 (what the receipt / invoice say)
    $o = $this->makeOrder($c, $store, [[$p, 2]], ['status' => 'delivered', 'payment_status' => 'paid', 'shipping_fee' => 85, 'delivered_at' => now()]);
    expect($o->grandTotal())->toBe(1925.0)->and(RevenueService::salesFor($store->id))->toBe(1925.0);
    // Not counted: an unpaid delivered order and a cancelled one
    $this->makeOrder($c, $store, [[$p, 1]], ['status' => 'delivered', 'payment_status' => 'unpaid', 'delivered_at' => now()]);
    $this->makeOrder($c, $store, [[$p, 1]], ['status' => 'cancelled']);

    $this->actingAs($owner)->get('/seller/dashboard')->assertOk()
        ->assertInertia(fn ($pg) => $pg->where('stats.revenueThisMonth', 1925)->where('stats.deliveryFeesThisMonth', 85)->where('stats.revenueAllTime', 1925));
    $this->actingAs($owner)->get('/seller/revenue')->assertOk()
        ->assertInertia(fn ($pg) => $pg->where('summary.total_sales', 1925)->where('summary.month_sales', 1925));
    $this->actingAs($owner)->get('/seller/reports')->assertOk()
        ->assertInertia(fn ($pg) => $pg->where('summary.gross_revenue', 1925));
    [$from, $to] = MainDashboardService::period('month');
    $d = MainDashboardService::build($owner, $from, $to);
    expect($d['totals']['sales'])->toEqual(1925.0)->and($d['totals']['delivery_fees'])->toEqual(85.0)
        ->and(collect($d['rows'])->firstWhere('id', $store->id)['sales'])->toEqual(1925.0)
        ->and(collect($d['charts']['sales'])->sum("s{$store->id}"))->toEqual(1925.0);
    // The admin platform sales use the same definition
    expect(\App\Support\PlatformSales::between())->toBe(1925.0);
});

test('stock value at cost: the cost price, else the last received PO cost, else the selling price (counted as "no cost yet")', function () {
    $store = $this->makeStore();
    $owner = $this->ownerOf($store);
    $this->makeBranch($store);
    $withCost = $this->makeProduct($store, 11, 920, 2650, 10);              // cost_price 820
    $noCost = $this->makeProduct($store, 22, 1700, 3000, 5);
    $noCost->forceFill(['cost_price' => 0])->save();
    $legacy = $this->makeProduct($store, 50, 3500, 4000, 2);
    $legacy->forceFill(['cost_price' => 4000])->save();                      // the old default = its selling price → unknown
    $supplier = $this->makeSupplier($store);
    $po = \App\Models\PurchaseOrder::forceCreate(['store_id' => $store->id, 'supplier_id' => $supplier->id, 'po_number' => 'PO-000001', 'status' => 'received', 'created_by' => $owner->id]);
    \Illuminate\Support\Facades\DB::table('purchase_order_items')->insert(['purchase_order_id' => $po->id, 'product_id' => $legacy->id,
        'quantity_ordered' => 2, 'quantity_received' => 2, 'unit_cost' => 3100, 'line_total' => 6200, 'created_at' => now(), 'updated_at' => now()]);

    [$from, $to] = MainDashboardService::period('30d');
    $row = collect(MainDashboardService::build($owner, $from, $to)['rows'])->firstWhere('id', $store->id);
    // 10 × 820 + 5 × 3000 (selling, no cost) + 2 × 3100 (last PO cost)
    expect($row['stock_value'])->toEqual(10 * 820.0 + 5 * 3000.0 + 2 * 3100.0)->and($row['no_cost'])->toBe(1);
});

test('"New Order Received" goes to the owner, the Branch Manager and Orders staff — not to riders', function () {
    $main = $this->makeStore();
    $branch = $this->makeBranch($main);
    $bm = $this->makeBranchManager($branch);
    $rider = $this->makeRider($branch);
    \App\Services\StoreRoleService::assign($rider, [\App\Models\StoreRole::where('store_id', $branch->id)->where('starter_key', 'rider')->value('id')]);
    $cashier = $this->makeUser(['role' => 'seller_staff', 'store_id' => $branch->id]);
    \App\Services\StoreRoleService::assign($cashier, [\App\Models\StoreRole::where('store_id', $branch->id)->where('starter_key', 'cashier')->value('id')]);

    \App\Services\NotificationService::sendToStoreModule($branch->id, 'orders', 'order_update', 'New Order Received', 'Order #X', ['link' => '/seller/orders/1']);

    $got = Notification::where('title', 'New Order Received')->pluck('user_id')->map(fn ($v) => (int) $v)->sort()->values()->all();
    expect($got)->toBe(collect([(int) $main->user_id, $bm->id, $cashier->id])->sort()->values()->all())
        ->and(Notification::where('user_id', $rider->id)->exists())->toBeFalse()
        ->and(Notification::where('user_id', $main->user_id)->value('data')['link'])->toBe("/seller/orders/1?store={$branch->id}");
});

test('Add branch → "Imus Branch sent for review" toast on the Branches page', function () {
    \Illuminate\Support\Facades\Storage::fake('local');
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);
    $file = fn ($n) => \Illuminate\Http\UploadedFile::fake()->create($n, 50, 'application/pdf');
    $res = $this->actingAs($owner)->post('/seller/branches', [
        'branch_name' => 'Imus Branch', 'address' => '45 Aguinaldo Hwy', 'city' => 'Imus', 'barangay' => 'Anabu I-A', 'phone' => '09171234500',
        'latitude' => 14.3929, 'longitude' => 120.9406, 'always_open' => '1',
        'business_permit' => $file('a.pdf'), 'fsic_permit' => $file('b.pdf'), 'doe_lpg_license' => $file('c.pdf'),
        'business_permit_valid_until' => now()->addYear()->toDateString(), 'fsic_permit_valid_until' => now()->addYear()->toDateString(),
        'doe_lpg_license_valid_until' => now()->addYears(3)->toDateString(),
    ]);
    $res->assertRedirect('/seller/branches');
    $this->actingAs($owner)->get('/seller/branches')->assertOk()
        ->assertInertia(fn ($pg) => $pg->where('flash.success', "Imus Branch sent for review. We'll notify you when it's approved."));
});
