<?php

use App\Services\SeasonalForecastService as S;
use Illuminate\Support\Carbon;

/** Consecutive months ending the month before $today: base × pattern[month] + growth × t (no noise). */
function seasonalSeries(int $months, array $pattern, float $base = 100, float $growth = 0.5, string $today = '2026-11-15'): array
{
    $last = Carbon::parse($today)->startOfMonth()->subMonth();
    $out = [];
    for ($k = $months - 1, $t = 0; $k >= 0; $k--, $t++) {
        $d = $last->copy()->subMonthsNoOverflow($k);
        $out[$d->format('Y-m')] = round(($base + $growth * $t) * ($pattern[$d->month] ?? 1.0));
    }

    return $out;
}

// Dec +30%, Apr −10% (Jan and Feb −10% too so the true pattern averages exactly 1.00)
$pattern = [12 => 1.30, 4 => 0.90, 1 => 0.90, 2 => 0.90];

test('36 months with a known Dec +30% / Apr −10% pattern → ratio-to-moving-average indices within ±3%, averaging 1.00', function () use ($pattern) {
    $r = S::analyse(seasonalSeries(36, $pattern), Carbon::parse('2026-11-15'));

    expect($r['method'])->toBe('cma')->and($r['months'])->toBe(36)->and($r['enough'])->toBeTrue()
        ->and($r['indices'][12])->toEqualWithDelta(1.30, 0.03)
        ->and($r['indices'][4])->toEqualWithDelta(0.90, 0.03)
        ->and($r['indices'][7])->toEqualWithDelta(1.00, 0.03)
        ->and(array_sum($r['indices']) / 12)->toEqualWithDelta(1.0, 0.0005)
        ->and($r['peaks'])->toBe([12])            // only December is ≥ 1.10
        ->and($r['lows'])->toHaveCount(1)
        ->and($r['method_label'])->toBe('ratio-to-moving-average, 36 months');

    // Next 3 calendar months: Dec, Jan, Feb — December above the current month (November)
    expect(array_column($r['forecast'], 'ym'))->toBe(['2026-12', '2027-01', '2027-02'])
        ->and($r['forecast'][0]['qty'])->toBeGreaterThan($r['current']['qty'])
        ->and($r['next_90'])->toBeGreaterThan($r['next_30']);

    // Backtest on exact data: very small error
    expect($r['backtest'])->not->toBeNull()->and($r['backtest']['mape'])->toBeLessThan(5.0)->and($r['backtest']['grade'])->toBe('Good');
});

test('< 12 months → no seasonality (all 1.00) and the "not enough history" message; the plain trend still forecasts', function () use ($pattern) {
    $r = S::analyse(seasonalSeries(10, $pattern), Carbon::parse('2026-11-15'));

    expect($r['method'])->toBe('none')->and($r['enough'])->toBeFalse()
        ->and(array_unique(array_values($r['indices'])))->toBe([1.0])
        ->and($r['message'])->toBe('Not enough history for seasonality (need 12 months; you have 10).')
        ->and($r['peaks'])->toBe([])->and($r['lows'])->toBe([])
        ->and($r['forecast'][0]['qty'])->toBeGreaterThan(0)
        ->and($r['backtest'])->toBeNull();
});

test('14 months → ratio-to-mean; the MAPE backtest needs ≥ 15 months', function () use ($pattern) {
    $r14 = S::analyse(seasonalSeries(14, $pattern), Carbon::parse('2026-11-15'));
    expect($r14['method'])->toBe('mean')->and($r14['method_label'])->toBe('ratio-to-mean, 14 months')
        ->and($r14['backtest'])->toBeNull()
        ->and(array_sum($r14['indices']) / 12)->toEqualWithDelta(1.0, 0.0005)
        ->and($r14['indices'][12])->toBeGreaterThan(1.15);

    $r15 = S::analyse(seasonalSeries(15, $pattern), Carbon::parse('2026-11-15'));
    expect($r15['backtest'])->not->toBeNull()->and($r15['backtest']['months'])->toHaveCount(3)
        ->and($r15['backtest'])->toHaveKeys(['mape', 'mae', 'grade']);
});

test('never a negative forecast (a steep fall); months with 0 sales are skipped in MAPE', function () {
    $series = seasonalSeries(18, [], 200, -12);   // 200 → −4 → clamped by the data itself at 0
    $series = array_map(fn ($v) => max(0, $v), $series);
    $r = S::analyse($series, Carbon::parse('2026-11-15'));

    expect(collect($r['forecast'])->every(fn ($f) => $f['qty'] >= 0))->toBeTrue()
        ->and($r['current']['qty'])->toBeGreaterThanOrEqual(0)
        ->and($r['next_90'])->toBeGreaterThanOrEqual(0);
    expect(S::forecastAt(['intercept' => 5.0, 'slope' => -10.0], 3, 1.2))->toBe(0.0);
});

test('fewer than 6 points → the mean is the level (no slope); helpers', function () {
    expect(S::trend(['2026-01', '2026-02', '2026-03'], [10.0, 20.0, 30.0], array_fill(1, 12, 1.0)))->toBe(['intercept' => 20.0, 'slope' => 0.0])
        ->and(S::pct(1.28))->toBe('+28%')->and(S::pct(0.91))->toBe('−9%')
        ->and(S::complete(['2026-08' => 0, '2026-09' => 4], Carbon::parse('2026-11-01')))->toBe(['2026-09' => 4, '2026-10' => 0]);

    // One stray old row, then 4 empty months, then regular sales → the series starts where sales resume;
    // a gap at the END (sales stopped) is kept
    expect(array_keys(S::complete(['2026-01' => 2, '2026-06' => 9, '2026-07' => 8, '2026-08' => 10], Carbon::parse('2026-09-01'))))->toBe(['2026-06', '2026-07', '2026-08'])
        ->and(array_keys(S::complete(['2026-01' => 5, '2026-02' => 5], Carbon::parse('2026-07-01'))))->toBe(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
});
