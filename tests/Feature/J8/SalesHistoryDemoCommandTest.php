<?php

use App\Models\Invoice;
use App\Models\Order;
use App\Models\PaymentReceipt;
use App\Models\SalesHistory;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->p11 = $this->makeProduct($this->store, 11);
    $this->p27 = $this->makeProduct($this->store, 2.7);
    $this->hose = $this->makeAccessory($this->store);
    $this->inactive = $this->makeProduct($this->store, 22);
    $this->inactive->update(['is_active' => false]);
});

test('refuses outside local / testing without --force', function () {
    app()->detectEnvironment(fn () => 'production');

    $this->artisan('sales-history:demo', ['store' => $this->store->id])->assertFailed()
        ->expectsOutputToContain('Refusing');
    expect(SalesHistory::count())->toBe(0);

    $this->artisan('sales-history:demo', ['store' => $this->store->id, '--force' => true])->assertSuccessful()
        ->expectsOutputToContain('GENERATED demo sales history');
    expect(SalesHistory::count())->toBeGreaterThan(0);
});

test('generates 2 years for every ACTIVE product (source demo); a re-run replaces, never duplicates; no orders / invoices / receipts', function () {
    $before = [Order::count(), Invoice::count(), PaymentReceipt::count()];

    $this->artisan('sales-history:demo', ['store' => $this->store->id])->assertSuccessful();
    $first = SalesHistory::count();
    $perProduct = SalesHistory::groupBy('product_id')->selectRaw('product_id, MIN(sold_on) AS a, MAX(sold_on) AS b, SUM(quantity) AS q')->get()->keyBy('product_id');

    expect($perProduct->keys()->sort()->values()->all())->toBe(collect([$this->p11->id, $this->p27->id, $this->hose->id])->sort()->values()->all())
        ->and(SalesHistory::where('source', '!=', 'demo')->count())->toBe(0)
        ->and(\Illuminate\Support\Carbon::parse($perProduct[$this->p11->id]->b)->toDateString())->toBe(now()->subDay()->toDateString())
        ->and(\Illuminate\Support\Carbon::parse($perProduct[$this->p11->id]->a)->lte(now()->subYears(2)->addDays(3)))->toBeTrue()
        // 11 kg ≈ 3/day default → roughly 2,200 in 2 years; the 2.7 kg ≈ 2/day
        ->and((int) $perProduct[$this->p11->id]->q)->toBeGreaterThan(1800)->toBeLessThan(2700)
        ->and((int) $perProduct[$this->p27->id]->q)->toBeLessThan((int) $perProduct[$this->p11->id]->q);

    $this->artisan('sales-history:demo', ['store' => $this->store->id])->assertSuccessful();
    expect(SalesHistory::count())->toBe($first)   // replaced (seeded → identical), not doubled
        ->and([Order::count(), Invoice::count(), PaymentReceipt::count()])->toBe($before);

    // Imported rows are never touched by the generator
    SalesHistory::create(['store_id' => $this->store->id, 'product_id' => $this->p11->id, 'product_label' => 'x', 'sold_on' => now()->subYears(3), 'quantity' => 1, 'source' => 'import', 'import_batch' => 'b']);
    $this->artisan('sales-history:demo', ['store' => $this->store->id])->assertSuccessful();
    expect(SalesHistory::where('source', 'import')->count())->toBe(1);
});

test('the base comes from recent real demand when there is enough of it (≥ 30 units in 30 days), else the size default', function () {
    [, $customer] = $this->makeCustomer();
    $this->makeOrder($customer, $this->store, [[$this->p11, 150]], ['status' => 'delivered']);   // 5 a day
    $this->makeOrder($customer, $this->store, [[$this->p27, 3]], ['status' => 'delivered']);    // too few → default 2/day

    \App\Services\SalesHistoryDemoService::generate($this->store);
    $q = SalesHistory::groupBy('product_id')->selectRaw('product_id, SUM(quantity) AS q')->pluck('q', 'product_id');
    expect((int) $q[$this->p11->id])->toBeGreaterThan(3100)->toBeLessThan(4400)   // ≈ 5 × 730 × season / growth
        ->and((int) $q[$this->p27->id])->toBeGreaterThan(1200)->toBeLessThan(1800)
        ->and(\Illuminate\Support\Carbon::parse(SalesHistory::max('sold_on'))->toDateString())->toBe(now()->subDay()->toDateString());
});
