<?php

use App\Services\MainDashboardService;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

beforeEach(function () {
    $this->main = $this->makeStore();
    $this->owner = $this->ownerOf($this->main);
    $this->branch = $this->makeBranch($this->main);
    [, $this->c] = $this->makeCustomer();
    // 11 kg: main has 30 (reorder 5 → > 2×), the branch 2 (≤ reorder 5) → an imbalance
    $this->pm = $this->makeProduct($this->main, 11, 700, 900, 30);
    $this->pb = $this->makeProduct($this->branch, 11, 700, 900, 2);
    $paid = ['status' => 'delivered', 'payment_status' => 'paid'];
    $this->makeOrder($this->c, $this->main, [[$this->pm, 2]], $paid);       // 1 400
    $this->makeOrder($this->c, $this->main, [[$this->pm, 1]], $paid);       //   700
    $this->makeOrder($this->c, $this->branch, [[$this->pb, 3]], $paid);     // 2 100
    $this->makeOrder($this->c, $this->branch, [[$this->pb, 1]], ['status' => 'cancelled']);
});

test('totals = the sum over the stores; one comparison row per store; all in a few grouped queries', function () {
    [$from, $to] = MainDashboardService::period('30d');
    \Illuminate\Support\Facades\DB::enableQueryLog();
    $d = MainDashboardService::build($this->owner, $from, $to);
    $queries = count(\Illuminate\Support\Facades\DB::getQueryLog());

    $rows = collect($d['rows'])->keyBy('id');
    expect($rows)->toHaveCount(2)
        ->and($rows[$this->main->id]['sales'])->toEqual(2100.0)->and($rows[$this->main->id]['orders'])->toBe(2)
        ->and($rows[$this->branch->id]['sales'])->toEqual(2100.0)->and($rows[$this->branch->id]['orders'])->toBe(2)
        ->and($rows[$this->branch->id]['cancel_rate'])->toEqual(50.0)
        ->and($rows[$this->branch->id]['plan'])->toBe('Free trial')
        ->and($d['totals']['sales'])->toEqual(4200.0)->and($d['totals']['orders'])->toBe(4)
        ->and($d['totals']['delivered'])->toBe(3)->and($d['totals']['by_status']['cancelled'])->toBe(1)
        ->and($rows[$this->main->id]['stock_value'])->toEqual(30 * 600.0);
    expect($queries)->toBeLessThan(25);   // grouped SQL, not per store
});

test('the DSS notes: a stock imbalance → "Transfer 8 × 11kg from Main to Imus Branch" (+ the suggestion); renew a plan ending soon', function () {
    $this->branch->forceFill(['subscription_expires_at' => now()->addDays(3)->subHour()])->save();
    [$from, $to] = MainDashboardService::period('30d');
    $d = MainDashboardService::build($this->owner, $from, $to);

    $texts = collect($d['notes'])->pluck('text');
    expect($texts)->toContain('Transfer 8 × 11kg from Main to Imus Branch.')
        ->and($texts)->toContain("Renew Imus Branch's plan (3 days left).");
    expect($d['suggestions'][0])->toMatchArray(['quantity' => 8, 'from_store_id' => $this->main->id, 'to_store_id' => $this->branch->id,
        'from_product_id' => $this->pm->id, 'to_product_id' => $this->pb->id]);

    $this->actingAs($this->owner)->get('/seller/main-dashboard?period=7d')->assertOk()
        ->assertInertia(fn ($p) => $p->component('seller/main-dashboard')->where('period.key', '7d')->has('dashboard.rows', 2));
    $this->actingAs($this->owner)->get('/seller/main-dashboard/export?format=csv')->assertOk();
});

test('the main store on the trial / Premium lapsed → the main dashboard is locked (branches keep running)', function () {
    $this->main->forceFill(['subscription_expires_at' => now()->subDay()])->save();
    $this->actingAs($this->owner)->get('/seller/main-dashboard')->assertRedirect()
        ->assertSessionHas('error', fn ($m) => str_contains($m, 'paid Premium'));

    $this->main->forceFill(['subscription_plan' => 'trial', 'subscription_expires_at' => now()->addDays(5)])->save();
    $this->actingAs($this->owner)->get('/seller/main-dashboard')->assertRedirect();
    // The branch keeps working as a normal store under its own plan
    $this->actingAs($this->owner)->post('/seller/switch-store', ['store_id' => $this->branch->id]);
    $this->actingAs($this->owner)->get('/seller/dashboard')->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $this->branch->id));
});
