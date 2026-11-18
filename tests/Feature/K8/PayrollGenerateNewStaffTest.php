<?php

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use App\Services\PayrollCalculator;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;

uses(Tests\Concerns\BuildsLpgWorld::class);

afterEach(fn () => Carbon::setTestNow());

/** A rider with a personal hourly rate, created on $createdAt, who worked one shift on $workedOn. */
function k8Staff($test, $store, string $createdAt, string $workedOn): User
{
    $u = (fn () => $this->makeRider($store, ['schedule_start' => '08:00', 'schedule_end' => '17:00']))->call($test);
    $u->forceFill(['hourly_rate_override' => 70, 'created_at' => $createdAt])->save();
    Attendance::forceCreate(['user_id' => $u->id, 'store_id' => $store->id, 'date' => $workedOn,
        'clock_in' => "{$workedOn} 08:00:00", 'clock_out' => "{$workedOn} 17:00:00", 'status' => 'present']);

    return $u->fresh();
}

test('Generate for a whole month with a staff member created mid-period → fast redirect, one draft each, the new one\'s days start at the created date', function () {
    Carbon::setTestNow('2026-12-02 09:00:00');
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $old = k8Staff($this, $store, '2026-08-01 10:00:00', '2026-11-05');
    $new = k8Staff($this, $store, '2026-11-10 15:30:00', '2026-11-12');   // period start + 9 days
    expect($new->created_at)->toBeInstanceOf(CarbonImmutable::class);   // the case that used to loop forever

    $t = microtime(true);
    $this->actingAs($owner)->post('/seller/payroll/generate', ['period_start' => '2026-11-01', 'period_end' => '2026-11-30'])
        ->assertRedirect()->assertSessionHas('success', 'Payroll generated for 2 staff.');
    expect(microtime(true) - $t)->toBeLessThan(10.0);

    expect(Payroll::where('user_id', $old->id)->count())->toBe(1)
        ->and(Payroll::where('user_id', $new->id)->count())->toBe(1);
    $newLines = collect(Payroll::where('user_id', $new->id)->first()->breakdown['lines'])->pluck('date');
    $oldLines = collect(Payroll::where('user_id', $old->id)->first()->breakdown['lines'])->pluck('date');
    expect($newLines->first())->toBe('2026-11-10')->and($newLines->last())->toBe('2026-11-30')->and($newLines)->toHaveCount(21)
        ->and($oldLines->first())->toBe('2026-11-01')->and($oldLines)->toHaveCount(30);
});

test('date-range helper: immutable and mutable inputs → 31 dates for a 31-day period; reversed → []; > 400 days → null', function () {
    $r = PayrollCalculator::dateRange(CarbonImmutable::parse('2026-12-01'), CarbonImmutable::parse('2026-12-31'));
    expect($r)->toHaveCount(31)->and($r[0])->toBe('2026-12-01')->and($r[30])->toBe('2026-12-31');
    expect(PayrollCalculator::dateRange(Carbon::parse('2026-12-01'), CarbonImmutable::parse('2026-12-31')))->toBe($r)
        ->and(PayrollCalculator::dateRange(CarbonImmutable::parse('2026-12-05'), CarbonImmutable::parse('2026-12-01')))->toBe([])
        ->and(PayrollCalculator::dateRange(CarbonImmutable::parse('2025-01-01'), CarbonImmutable::parse('2026-12-31')))->toBeNull();
});

test('safety net: a staff member added after the period, or a period > 400 days, is skipped with a message (never loops)', function () {
    Carbon::setTestNow('2026-12-02 09:00:00');
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    $late = k8Staff($this, $store, '2026-11-20 10:00:00', '2026-11-05');   // attendance before the account existed (bad data)

    $this->actingAs($owner)->post('/seller/payroll/generate', ['period_start' => '2026-11-01', 'period_end' => '2026-11-10'])
        ->assertRedirect()->assertSessionHas('success', fn ($m) => str_contains($m, "{$late->name} (added after this period)"));
    expect(Payroll::count())->toBe(0);

    $this->actingAs($owner)->post('/seller/payroll/generate', ['period_start' => '2025-01-01', 'period_end' => '2026-11-30'])
        ->assertRedirect()->assertSessionHas('success', fn ($m) => str_contains($m, 'period longer than 400 days'));
    expect(Payroll::count())->toBe(0);
});
