<?php

use App\Models\User;
use App\Support\SuccessRate;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

test('A1: Reports average order value = Store Dashboard average order value (revenue ÷ delivered and paid orders)', function () {
    $store = $this->makeStore();
    $owner = $this->ownerOf($store);
    $p = $this->makeProduct($store, 11, 1000, 1200);
    [, $c] = $this->makeCustomer();
    // one delivered + paid order (₱2,000 items + ₱80 delivery) and two pending orders, all this month
    $this->makeOrder($c, $store, [[$p, 2]], ['status' => 'delivered', 'payment_status' => 'paid', 'shipping_fee' => 80, 'delivered_at' => now()]);
    $this->makeOrder($c, $store, [[$p, 1]], ['status' => 'pending']);
    $this->makeOrder($c, $store, [[$p, 3]], ['status' => 'pending']);

    $dashAov = null;
    $this->actingAs($owner)->get('/seller/dashboard')->assertOk()
        ->assertInertia(function ($pg) use (&$dashAov) {
            $dashAov = $pg->toArray()['props']['stats']['averageOrderValue'];
        });
    expect((float) $dashAov)->toBe(2080.0);

    $from = now()->startOfMonth()->toDateString();
    $to = now()->toDateString();
    $this->actingAs($owner)->get("/seller/reports?date_from={$from}&date_to={$to}")->assertOk()
        ->assertInertia(fn ($pg) => $pg
            ->where('summary.gross_revenue', 2080)
            ->where('summary.delivered_orders', 1)
            ->where('summary.total_orders', 3)                // placed (not cancelled) — its own card
            ->where('summary.average_order_value', $dashAov)  // was 2080 ÷ 3 = 693.33 before K11
            ->where('chart', fn ($rows) => collect($rows)->sum('delivered') === 1 && collect($rows)->sum('orders') === 3));

    // CSV: the daily table has both counts and its total row matches the cards
    $csv = $this->actingAs($owner)->get("/seller/reports/export?format=csv&date_from={$from}&date_to={$to}")->assertOk()->streamedContent();
    expect($csv)->toContain('"Orders placed","Delivered & paid",Revenue')->toContain('TOTAL,3,1,"2,080.00"');
});

test('A1: the Store Dashboard shows revenue once — the second tile is Unpaid Invoices', function () {
    $store = $this->makeStore();
    $owner = $this->ownerOf($store);
    $this->actingAs($owner)->get('/seller/dashboard')->assertOk()
        ->assertInertia(fn ($pg) => $pg->has('stats.unpaidInvoices')->has('stats.unpaidInvoicesAmount'));
});

test('A2: delivery success rate = delivered ÷ (delivered + failed); deliveries on the way are not failures', function () {
    expect(SuccessRate::of(6, 0))->toBe(100)
        ->and(SuccessRate::of(3, 1))->toBe(75)
        ->and(SuccessRate::of(0, 0))->toBeNull();

    $store = $this->makeStore();
    $owner = $this->ownerOf($store);
    $rider = $this->makeRider($store);
    $p = $this->makeProduct($store, 11, 1000, 1200);
    [, $c] = $this->makeCustomer();
    foreach (['delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'in_transit', 'assigned'] as $st) {
        $o = $this->makeOrder($c, $store, [[$p, 1]], ['status' => $st === 'delivered' ? 'delivered' : 'out_for_delivery']);
        $this->makeDelivery($o, $rider, $st, $st === 'delivered' ? ['delivered_at' => now()] : []);
    }

    $this->actingAs($owner)->get('/seller/dss')->assertOk()
        ->assertInertia(fn ($pg) => $pg
            ->where('insights.delivery_success_rate', 100)   // was 75 ("0 of 8 failed")
            ->where('insights.delivered_deliveries', 6)
            ->where('insights.failed_deliveries', 0)
            ->where('insights.in_progress_deliveries', 2)
            ->where('insights.total_deliveries', 8));
});

test('B4: an account with only `name` gets first / last name prefilled, and the backfill fills only empty rows', function () {
    expect(User::splitName('Juan Dela Cruz'))->toBe(['first_name' => 'Juan Dela', 'last_name' => 'Cruz', 'suffix' => ''])
        ->and(User::splitName('Maria Santos Jr.'))->toBe(['first_name' => 'Maria', 'last_name' => 'Santos', 'suffix' => 'Jr.'])
        ->and(User::splitName('Cher'))->toBe(['first_name' => 'Cher', 'last_name' => '', 'suffix' => '']);

    [$old] = $this->makeCustomer(['name' => 'Ana Maria Reyes', 'first_name' => null, 'last_name' => null]);
    $kept = $this->makeUser(['name' => 'Ben Cruz Tan', 'first_name' => 'Ben', 'last_name' => 'Cruz Tan']);

    // the form is prefilled even before the backfill
    $this->actingAs($old)->get('/customer/profile')->assertOk()
        ->assertInertia(fn ($pg) => $pg->where('profile.first_name', 'Ana Maria')->where('profile.last_name', 'Reyes'));

    $before = $old->fresh()->updated_at;
    expect(User::backfillNameParts())->toBeGreaterThanOrEqual(1);
    $old->refresh();
    $kept->refresh();
    expect($old->first_name)->toBe('Ana Maria')->and($old->last_name)->toBe('Reyes')->and($old->name)->toBe('Ana Maria Reyes')
        ->and($old->updated_at->equalTo($before))->toBeTrue()
        ->and($kept->first_name)->toBe('Ben')->and($kept->last_name)->toBe('Cruz Tan');

    // idempotent: nothing left to fill
    expect(User::backfillNameParts())->toBe(0);
    $this->artisan('users:backfill-names')->expectsOutputToContain('0 account(s)')->assertSuccessful();
});
