<?php

use App\Models\SalesHistory;
use App\Services\SeasonalForecastService as S;
use Illuminate\Support\Carbon;

uses(Tests\Concerns\BuildsLpgWorld::class);

afterEach(fn () => Carbon::setTestNow());

// ── Item 2: the peak order covers what sells before the peak starts ─────────
test('peak advice: Nov 19, 45 usable, Nov 3.3/day, Dec 131 → about 40 sell before December, order ≈ 126; with 50 on order ≈ 76', function () {
    $today = Carbon::parse('2026-11-19');
    $monthly = ['2026-11' => ['raw' => 3.3 * 30], '2026-12' => ['raw' => 131.0], '2027-01' => ['raw' => 99.0]];

    $a = S::peakOrder(45, 0, $monthly, '2026-12', $today);
    expect($a['sold_before'])->toEqualWithDelta(40, 1)
        ->and($a['order'])->toEqualWithDelta(126, 2);

    $b = S::peakOrder(45, 50, $monthly, '2026-12', $today);
    expect($b['order'])->toEqualWithDelta(76, 2);

    // Plenty of stock → 0, never negative
    expect(S::peakOrder(500, 0, $monthly, '2026-12', $today)['order'])->toBe(0);
});

// ── Item 3: a partial first month ────────────────────────────────────────────
test('a series starting on the 19th: the partial first month is dropped (≥ 12 left) or scaled (< 12 left); clean indices stay within ±3%', function () {
    $pattern = [12 => 1.30, 4 => 0.90, 1 => 0.90, 2 => 0.90];
    $today = Carbon::parse('2026-11-15');
    // 37 months Oct 2023 … Oct 2026, the first (Oct 2023) only from the 19th → about 13/31 of a month
    $series = [];
    for ($k = 36, $t = 0; $k >= 0; $k--, $t++) {
        $d = Carbon::parse('2026-10-01')->subMonthsNoOverflow($k);
        $series[$d->format('Y-m')] = (int) round((100 + 0.5 * $t) * ($pattern[$d->month] ?? 1.0));
    }
    $series['2023-10'] = (int) round($series['2023-10'] * 13 / 31);   // 41 instead of ~100

    $fixed = S::partialFirst($series, '2023-10-19');
    expect(array_key_first($fixed))->toBe('2023-11')->and($fixed)->toHaveCount(36);

    $r = S::analyse($fixed, $today);
    expect($r['indices'][12])->toEqualWithDelta(1.30, 0.03)->and($r['indices'][4])->toEqualWithDelta(0.90, 0.03)
        ->and($r['indices'][10])->toEqualWithDelta(1.00, 0.03);

    // Short series (5 months) → scaled to a full-month estimate: 40 sold Nov 19–30 → 40 × 30 / 12 = 100
    $short = S::partialFirst(['2024-11' => 40, '2024-12' => 130, '2025-01' => 90, '2025-02' => 85, '2025-03' => 95], '2024-11-19');
    expect($short)->toHaveCount(5)->and($short['2024-11'])->toBe(100);

    // Starts on the 1st, or the date is in another month → unchanged
    expect(S::partialFirst(['2024-11' => 40, '2024-12' => 50], '2024-11-01'))->toBe(['2024-11' => 40, '2024-12' => 50]);
});

test('the store build drops a partial first month of history (demo-style start on the 19th)', function () {
    Carbon::setTestNow('2026-11-19 10:00:00');
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11);
    $rows = [];
    for ($d = Carbon::parse('2024-11-19'); $d->lt(Carbon::parse('2026-11-01')); $d = $d->copy()->addDay()) {
        $rows[] = ['store_id' => $store->id, 'product_id' => $p->id, 'product_label' => $p->name, 'size_group' => '11 kg',
            'sold_on' => $d->toDateString(), 'quantity' => 3, 'source' => 'demo', 'created_at' => now(), 'updated_at' => now()];
    }
    SalesHistory::insert($rows);

    $s = collect(S::build($store, Carbon::parse('2026-11-19'))['series'])->firstWhere('key', "product:{$p->id}");
    // Dec 2024 … Oct 2026 = 23 complete months; the half November 2024 is gone (it would have read as a −60% month)
    expect($s['months'])->toBe(23)->and(collect($s['chart'])->pluck('ym'))->not->toContain('2024-11')
        ->and(collect($s['indices'])->min())->toBeGreaterThan(0.9);
});

// ── Item 4: a new store with no complete month ───────────────────────────────
test('a new store with 2 units sold 3 days ago → next 30 days > 0, labelled as based on the recent days', function () {
    Carbon::setTestNow('2026-11-19 10:00:00');
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11);
    [, $c] = $this->makeCustomer();
    $o = $this->makeOrder($c, $store, [[$p, 2]], ['status' => 'delivered']);
    $o->forceFill(['created_at' => now()->subDays(3)])->save();

    $series = collect(S::build($store, Carbon::parse('2026-11-19'))['series']);
    $total = $series->firstWhere('key', 'total');
    expect($total['months'])->toBe(0)->and($total['basis'])->toBe('recent')
        ->and($total['next_30'])->toBeGreaterThan(0)
        ->and($total['message'])->toBe('Based on your last 4 days (not enough history for seasonality).');
    // 2 units over 4 days → 0.5 a day → 15 in 30 days
    expect($total['next_30'])->toBe(15)
        ->and($series->firstWhere('key', "product:{$p->id}")['next_30'])->toBe(15);

    // With ≥ 1 complete month the normal (month-based) path is unchanged
    expect(S::analyse(['2026-10' => 30], Carbon::parse('2026-11-19'), null, ['qty' => 99, 'days' => 1])['basis'])->toBe('months');
});
