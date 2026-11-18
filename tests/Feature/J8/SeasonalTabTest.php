<?php

use App\Exceptions\StockUnavailableException;
use App\Models\User;
use App\Services\SalesHistoryDemoService;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

uses(Tests\Concerns\BuildsLpgWorld::class);

afterEach(fn () => Carbon::setTestNow());

test('the DSS page returns the seasonal payload; on Nov 1 the advice mentions December (peak within 45 days); demo badge flag', function () {
    Carbon::setTestNow('2026-11-01 09:00:00');
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $p = $this->makeProduct($store, 11, 750, 950, 40);
    $p->update(['name' => '11kg Petron Gasul']);
    $supplier = $this->makeSupplier($store, ['lead_time_days' => 3]);
    $this->linkSupplier($supplier, $p, 690);
    SalesHistoryDemoService::generate($store, 2);

    $res = $this->actingAs($owner)->get('/seller/dss')->assertOk();
    $res->assertInertia(fn ($page) => $page
        ->where('seasonal.has_demo', true)
        ->where('seasonal.series.0.key', 'total')
        ->where('seasonal.series.0.method', 'cma')
        ->where('seasonalCan.owner', true)
        ->has('seasonal.series.0.chart')
        ->where('seasonal.advice', fn ($advice) => collect($advice)->contains(fn ($a) => $a['type'] === 'peak'
            && str_starts_with($a['text'], 'December is usually +') && str_contains($a['text'], 'for 11kg Petron Gasul')
            && str_contains($a['text'], 'You have 40 usable') && str_contains($a['text'], '3-day supplier lead time')
            && str_contains($a['text'], 'by Nov 28'))));

    $series = collect($res->viewData('page')['props']['seasonal']['series'])->firstWhere('key', "product:{$p->id}");
    expect($series['peaks'])->toContain(12)->and($series['indices']['12'])->toBeGreaterThan(1.15)
        ->and($series['forecast'][0]['ym'])->toBe('2026-12');

    // Owner removes the demo history → the badge goes away
    $this->actingAs($owner)->delete('/seller/dss/sales-history/demo')->assertSessionHas('success');
    $this->actingAs($owner)->get('/seller/dss')->assertInertia(fn ($page) => $page->where('seasonal.has_demo', false)
        ->where('seasonal.advice.0.text', 'Import your past sales (CSV) to see seasonal patterns.'));
});

test('no history → "not enough history" on the total, all indices 1.00', function () {
    $store = $this->makeStore();
    $this->makeProduct($store, 11);
    $this->actingAs(User::find($store->user_id))->get('/seller/dss')->assertInertia(fn ($page) => $page
        ->where('seasonal.has_demo', false)->where('seasonal.series.0.enough', false)->where('seasonal.series.0.indices.12', 1)
        ->where('seasonal.advice.0.type', 'history'));
});

test('D: a confirm without usable stock is NOT written to the log as an error', function () {
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11, 750, 950, 0);
    $this->makeBatch($p, 2, now()->subDay()->toDateString());   // expired only
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $store, [[$p, 1]], ['status' => 'pending']);

    Log::spy();
    $this->actingAs(User::find($store->user_id))->patch("/seller/orders/{$order->id}/status", ['status' => 'confirmed'])->assertSessionHas('error');

    Log::shouldNotHaveReceived('error');
    expect(app(ExceptionHandler::class)->shouldReport(new StockUnavailableException('x')))->toBeFalse();
});
