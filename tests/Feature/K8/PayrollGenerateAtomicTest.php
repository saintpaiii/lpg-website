<?php

use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\User;
use Illuminate\Support\Carbon;

uses(Tests\Concerns\BuildsLpgWorld::class);

afterEach(fn () => Carbon::setTestNow());

test('a failure on the 2nd staff member → no payslip rows at all for that Generate (one transaction)', function () {
    Carbon::setTestNow('2026-12-02 09:00:00');
    $store = $this->makeStore();
    $owner = User::find($store->user_id);
    foreach (range(1, 3) as $i) {
        $u = $this->makeRider($store, ['schedule_start' => '08:00', 'schedule_end' => '17:00']);
        $u->forceFill(['hourly_rate_override' => 70, 'created_at' => '2026-08-01 10:00:00'])->save();
        Attendance::forceCreate(['user_id' => $u->id, 'store_id' => $store->id, 'date' => '2026-11-05',
            'clock_in' => '2026-11-05 08:00:00', 'clock_out' => '2026-11-05 17:00:00', 'status' => 'present']);
    }

    // The 2nd payslip insert blows up (after the 1st was written)
    $n = 0;
    Payroll::creating(function () use (&$n) {
        if (++$n === 2) {
            throw new RuntimeException('boom on the 2nd staff member');
        }
    });

    $this->actingAs($owner)->post('/seller/payroll/generate', ['period_start' => '2026-11-01', 'period_end' => '2026-11-30'])
        ->assertStatus(500);
    expect($n)->toBe(2)->and(Payroll::withTrashed()->count())->toBe(0);
});
