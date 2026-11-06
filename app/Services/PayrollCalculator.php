<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Store;
use App\Models\StorePayrollSettings;
use App\Models\StoreRole;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Hourly payroll math (approved rules):
 *
 *  - Rate: personal hourly rate > the HIGHEST hourly rate among the person's store roles > the store default.
 *  - Paid time follows the SHIFT WINDOW: regular = max(clock-in, shift start) → min(clock-out, shift end), minus the
 *    unpaid meal break when that window is at least N hours; overtime = shift end → clock-out.
 *    Early arrival and late minutes are not paid; there is no fixed late deduction.
 *  - Regular and overtime are each floored to WHOLE hours per day. Overtime pay = hours × rate × multiplier.
 *  - No clock-out, no usable schedule (none, or end ≤ start) or a manual "day off" row → not paid (with a note).
 *  - Late = clock-in more than 15 min after the shift start, never on an extra day (same as AttendanceController::calcStats).
 */
class PayrollCalculator
{
    public const LATE_GRACE_MINUTES = 15;

    /** @return array{rate: float, source: string} source = personal | role:{name} | default */
    public static function hourlyRateFor(User $staff, Store $store, StorePayrollSettings $s): array
    {
        if ($staff->hourly_rate_override !== null) {
            return ['rate' => (float) $staff->hourly_rate_override, 'source' => 'personal'];
        }

        // User::storeRoles() isn't filtered by store — only this store's roles count
        $best = StoreRole::query()
            ->join('store_role_user', 'store_role_user.store_role_id', '=', 'store_roles.id')
            ->where('store_role_user.user_id', $staff->id)
            ->where('store_roles.store_id', $store->id)
            ->whereNotNull('store_roles.hourly_rate')
            ->orderByDesc('store_roles.hourly_rate')
            ->orderBy('store_roles.id')
            ->first(['store_roles.name', 'store_roles.hourly_rate']);

        if ($best) {
            return ['rate' => (float) $best->hourly_rate, 'source' => "role:{$best->name}"];
        }

        return ['rate' => (float) $s->default_hourly_rate, 'source' => 'default'];
    }

    /** "₱65.00/hour (role: Cashier)" style label of a rate source. */
    public static function sourceLabel(?string $source): string
    {
        return match (true) {
            $source === 'personal'                         => 'personal rate',
            $source !== null && str_starts_with($source, 'role:') => 'role: ' . substr($source, 5),
            default                                        => 'store default',
        };
    }

    /** Whole minutes from $from to $to (0 when $to is not after $from). */
    private static function minutes(CarbonInterface $from, CarbonInterface $to): int
    {
        return max(0, (int) floor(($to->getTimestamp() - $from->getTimestamp()) / 60));
    }

    private static function hm(int $minutes): string
    {
        return intdiv($minutes, 60) . ':' . str_pad((string) ($minutes % 60), 2, '0', STR_PAD_LEFT);
    }

    /** A line for a date without a worked shift (absent / day off). */
    private static function emptyLine(string $date, string $kind, string $note): array
    {
        return [
            'date' => $date, 'day' => Carbon::parse($date)->format('D'), 'kind' => $kind,
            'clock_in' => null, 'clock_out' => null, 'worked' => null, 'worked_min' => 0, 'break_min' => 0,
            'regular_h' => 0, 'ot_h' => 0, 'is_late' => false, 'late_minutes' => 0, 'is_extra_day' => false,
            'pay' => 0.0, 'note' => $note,
        ];
    }

    /**
     * One attendance row → one payslip line. Null when nobody clocked in on that row.
     * kind = worked | no_clock_out | no_schedule | day_off
     */
    public static function dayLine(Attendance $a, User $staff, StorePayrollSettings $s, float $rate): ?array
    {
        if (! $a->clock_in) {
            return null;
        }

        $date  = $a->date->toDateString();
        $extra = (bool) $a->is_extra_day;
        $line  = self::emptyLine($date, 'worked', '');
        $line['clock_in']     = $a->clock_in->format('g:i A');
        $line['clock_out']    = $a->clock_out?->format('g:i A');
        $line['is_extra_day'] = $extra;

        // Manual "day off" override → not paid (as in calcStats)
        if ($a->status === 'day_off') {
            return ['kind' => 'day_off', 'note' => 'Day off'] + $line;
        }

        $shiftStart = $shiftEnd = null;
        if ($staff->schedule_start && $staff->schedule_end) {
            $shiftStart = Carbon::parse("{$date} {$staff->schedule_start}");
            $shiftEnd   = Carbon::parse("{$date} {$staff->schedule_end}");
            if ($shiftEnd->lessThanOrEqualTo($shiftStart)) {
                $shiftStart = $shiftEnd = null;   // overnight shifts aren't supported by attendance
            }
        }

        // Late: more than 15 min after the shift start (never on an extra day). Late minutes are simply unpaid.
        if ($shiftStart && ! $extra && $a->clock_in->gt($shiftStart->copy()->addMinutes(self::LATE_GRACE_MINUTES))) {
            $line['is_late']      = true;
            $line['late_minutes'] = self::minutes($shiftStart, $a->clock_in);
        }

        if (! $a->clock_out) {
            return ['kind' => 'no_clock_out', 'note' => 'No clock-out — fix attendance'] + $line;
        }

        $worked = self::minutes($a->clock_in, $a->clock_out);
        $line['worked_min'] = $worked;
        $line['worked']     = self::hm($worked);

        if (! $shiftStart) {
            return ['kind' => 'no_schedule', 'note' => 'No schedule — set the shift in Staff'] + $line;
        }

        $from   = $a->clock_in->greaterThan($shiftStart) ? $a->clock_in : $shiftStart;
        $to     = $a->clock_out->lessThan($shiftEnd) ? $a->clock_out : $shiftEnd;
        $window = self::minutes($from, $to);

        $break = (! $s->meal_break_paid && $window >= (float) $s->meal_break_after_hours * 60)
            ? (int) $s->meal_break_minutes : 0;
        $regularMin = max(0, $window - $break);
        $otMin      = $a->clock_out->greaterThan($shiftEnd) ? self::minutes($shiftEnd, $a->clock_out) : 0;

        $regularH = intdiv($regularMin, 60);
        $otH      = intdiv($otMin, 60);

        $notes = [];
        if ($line['is_late']) $notes[] = "Late {$line['late_minutes']} min";
        if ($extra)           $notes[] = 'Extra day';

        return array_merge($line, [
            'break_min' => $break,
            'regular_h' => $regularH,
            'ot_h'      => $otH,
            'pay'       => round($regularH * $rate + $otH * $rate * (float) $s->overtime_multiplier, 2),
            'note'      => implode(' · ', $notes),
        ]);
    }

    /**
     * Payroll figures of one staff member for a period (fillable Payroll attributes + rate_source).
     */
    public static function calculate(User $staff, Store $store, string $periodStart, string $periodEnd, StorePayrollSettings $s): array
    {
        ['rate' => $rate, 'source' => $source] = self::hourlyRateFor($staff, $store, $s);
        $multiplier = (float) $s->overtime_multiplier;

        $rows = Attendance::where('user_id', $staff->id)
            ->where('store_id', $store->id)
            ->whereBetween('date', [$periodStart, $periodEnd])
            ->orderBy('date')
            ->get()
            ->keyBy(fn ($a) => $a->date->toDateString());

        // Dates listed: every day from max(period start, account created) to min(period end, today) + any rows
        $from = max(Carbon::parse($periodStart)->startOfDay(), $staff->created_at?->copy()->startOfDay() ?? Carbon::parse($periodStart));
        $to   = min(Carbon::parse($periodEnd)->startOfDay(), now()->startOfDay());
        $dates = [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $dates[$d->toDateString()] = true;
        }
        foreach ($rows->keys() as $k) {
            $dates[$k] = true;
        }
        ksort($dates);

        $lines = [];
        $present = $late = $absent = $halfDay = 0;
        $regularH = $otH = 0;

        foreach (array_keys($dates) as $date) {
            $a    = $rows->get($date);
            $line = $a ? self::dayLine($a, $staff, $s, $rate) : null;

            if (! $line) {
                // No clock-in that day: absent on a work day (within the counted range), otherwise a day off
                $inRange = $date >= $from->toDateString() && $date <= $to->toDateString();
                $manualOff = $a && $a->status === 'day_off';
                if ($inRange && ! $manualOff && $staff->worksOn($date)) {
                    $absent++;
                    $lines[] = self::emptyLine($date, 'absent', 'Absent');
                } else {
                    $lines[] = self::emptyLine($date, 'day_off', 'Day off');
                }
                continue;
            }

            $lines[] = $line;
            if ($line['kind'] === 'day_off') {
                continue;
            }
            $present++;
            if ($line['is_late']) $late++;
            if ($line['kind'] === 'worked' && $line['worked_min'] < 8 * 60) $halfDay++;
            $regularH += $line['regular_h'];
            $otH      += $line['ot_h'];
        }

        $basic = round($regularH * $rate, 2);
        $ot    = round($otH * $rate * $multiplier, 2);
        $gross = round($basic + $ot, 2);

        return [
            'pay_basis'            => 'hourly',
            'hourly_rate'          => round($rate, 2),
            'rate_source'          => $source,
            'daily_rate'           => null,
            'regular_hours'        => $regularH,
            'overtime_hours_paid'  => $otH,
            'total_overtime_hours' => $otH,
            'basic_pay'            => $basic,
            'overtime_pay'         => $ot,
            'late_deduction'       => 0,
            'absent_deduction'     => 0,
            'undertime_deduction'  => 0,
            'gross_pay'            => $gross,
            'net_pay'              => $gross,
            'days_present'         => $present,
            'days_late'            => $late,
            'days_absent'          => $absent,
            'days_half_day'        => $halfDay,
            'breakdown'            => [
                'lines'    => $lines,
                // Rules used, for the payslip's small print
                'rules'    => [
                    'rate_source'            => $source,
                    'overtime_multiplier'    => $multiplier,
                    'meal_break_paid'        => (bool) $s->meal_break_paid,
                    'meal_break_minutes'     => (int) $s->meal_break_minutes,
                    'meal_break_after_hours' => (float) $s->meal_break_after_hours,
                    'schedule'               => $staff->schedule_start && $staff->schedule_end
                        ? Carbon::parse($staff->schedule_start)->format('g:i A') . ' – ' . Carbon::parse($staff->schedule_end)->format('g:i A')
                        : null,
                ],
            ],
        ];
    }
}
