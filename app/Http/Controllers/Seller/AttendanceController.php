<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Attendance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    use GeneratesExport;
    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Only seller owner or HR staff may manage attendance. */
    private function canManage(): bool
    {
        $user = auth()->user();
        return $user->role === 'seller'
            || ($user->role === 'seller_staff' && $user->sub_role === 'hr');
    }

    /**
     * Calculate status, is_late flag, hours worked, and overtime.
     *
     * Status is based on ACTUAL hours worked (after clock-out):
     *   >= 8h → present | 4–7.99h → half_day | < 4h → undertime | no clock_in → absent
     * Provisional status while still clocked in (no clock_out):
     *   on time → present | arrived late → late
     * is_late is a SEPARATE flag: true when clock_in > schedule_start + 15 min.
     * No schedule → no_schedule status.
     *
     * @return array{status:string, is_late:bool, hours_worked:float, overtime:float}
     */
    private function calcStats(?Attendance $attendance, ?string $scheduleStart, ?string $scheduleEnd): array
    {
        $blank = ['status' => 'absent', 'is_late' => false, 'hours_worked' => 0.0, 'overtime' => 0.0];

        if (! $attendance || ! $attendance->clock_in) {
            return $blank;
        }

        // day_off is a manual override — preserve it untouched
        if ($attendance->status === 'day_off') {
            return ['status' => 'day_off', 'is_late' => false, 'hours_worked' => 0.0, 'overtime' => 0.0];
        }

        // No schedule → cannot determine status meaningfully
        if (! $scheduleStart || ! $scheduleEnd) {
            return ['status' => 'no_schedule', 'is_late' => false, 'hours_worked' => 0.0, 'overtime' => 0.0];
        }

        $clockIn  = $attendance->clock_in;   // Carbon (full datetime)
        $clockOut = $attendance->clock_out;  // Carbon|null
        $today    = $clockIn->format('Y-m-d');

        $scheduledStart = Carbon::parse("{$today} {$scheduleStart}");
        $scheduledEnd   = Carbon::parse("{$today} {$scheduleEnd}");

        // ── is_late: arrived more than 15 min after schedule start ──────────────
        $lateThreshold = (clone $scheduledStart)->addMinutes(15);
        $isLate = $clockIn->gt($lateThreshold);

        // ── Hours worked using seconds for precision (avoids 0 on <1-min diff) ──
        $hoursWorked = 0.0;
        if ($clockOut) {
            $hoursWorked = round($clockIn->diffInSeconds($clockOut) / 3600, 4);
        }

        // ── Status from actual hours (final when clocked out, provisional if not) ─
        if ($clockOut) {
            if ($hoursWorked >= 8.0) {
                $status = 'present';        // full day
            } elseif ($hoursWorked >= 4.0) {
                $status = 'half_day';       // 4 – 7.99h
            } else {
                $status = 'undertime';      // < 4h (including 0 = same-minute clock)
            }
        } else {
            // Not clocked out yet — provisional
            $status = $isLate ? 'late' : 'present';
        }

        // ── Overtime: hours beyond scheduled duration (only after clock-out) ────
        $overtime = 0.0;
        if ($clockOut) {
            $scheduledHours = max(0.0, $scheduledStart->diffInMinutes($scheduledEnd) / 60);
            $overtime = max(0.0, round($hoursWorked - $scheduledHours, 4));
        }

        return [
            'status'       => $status,
            'is_late'      => $isLate,
            'hours_worked' => round($hoursWorked, 4),
            'overtime'     => round($overtime, 4),
        ];
    }

    // ── Seller / HR: manage all staff attendance ──────────────────────────────

    public function index(Request $request): Response|RedirectResponse
    {
        if (! $this->canManage()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');
        $date  = $request->get('date') ?: now()->toDateString();

        // Validate date format
        try {
            $targetDate = Carbon::parse($date)->toDateString();
        } catch (\Exception) {
            $targetDate = now()->toDateString();
        }

        // All active staff for this store
        $staffList = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        // Attendance records for that date (keyed by user_id)
        $records = Attendance::where('store_id', $store->id)
            ->where('date', $targetDate)
            ->get()
            ->keyBy('user_id');

        $rows = $staffList->map(function (User $staff) use ($records, $targetDate, $store) {
            $att   = $records->get($staff->id);
            $stats = $this->calcStats($att, $staff->schedule_start, $staff->schedule_end);

            // Persist recalculated values to DB when they have changed
            if ($att && $att->status !== 'day_off') {
                $dirty = [];
                if ($att->status !== $stats['status'])           $dirty['status']         = $stats['status'];
                if ((float)$att->overtime_hours !== $stats['overtime'])  $dirty['overtime_hours'] = $stats['overtime'];
                if ((bool)$att->is_late !== $stats['is_late'])   $dirty['is_late']        = $stats['is_late'];
                if ($dirty) $att->update($dirty);
            }

            // Detect missing clock-out: clocked in, no clock-out, past 1h after schedule_end
            $isMissingClockOut = false;
            if ($att && $att->clock_in && ! $att->clock_out && $staff->schedule_end) {
                $today  = $att->clock_in->format('Y-m-d');
                $cutoff = Carbon::parse("{$today} {$staff->schedule_end}")->addHour();
                $isMissingClockOut = now()->gt($cutoff);
            }

            return [
                'user_id'           => $staff->id,
                'name'              => $staff->name,
                'sub_role'          => $staff->sub_role,
                'schedule_start'    => $staff->schedule_start,
                'schedule_end'      => $staff->schedule_end,
                'attendance_id'     => $att?->id,
                'clock_in'          => $att?->clock_in?->format('h:i A'),
                'clock_out'         => $att?->clock_out?->format('h:i A'),
                'status'            => $stats['status'],
                'is_late'           => $stats['is_late'],
                'hours_worked'      => $stats['hours_worked'],
                'overtime_hours'    => $stats['overtime'],
                'notes'             => $att?->notes,
                'missing_clock_out' => $isMissingClockOut,
            ];
        })->values();

        $summary = [
            'total'    => $rows->count(),
            'present'  => $rows->whereIn('status', ['present'])->count(),
            'late'     => $rows->where('is_late', true)->count(),           // arrived late (any final status)
            'absent'   => $rows->whereIn('status', ['absent', 'no_schedule'])->count(),
            'half_day' => $rows->whereIn('status', ['half_day', 'undertime'])->count(),
            'day_off'  => $rows->where('status', 'day_off')->count(),
        ];

        return Inertia::render('seller/attendance', [
            'rows'    => $rows,
            'date'    => $targetDate,
            'summary' => $summary,
        ]);
    }

    public function export(Request $request)
    {
        if (! $this->canManage()) abort(403);

        $store  = $request->attributes->get('seller_store');
        $format = $request->get('format', 'csv');

        try {
            $targetDate = \Carbon\Carbon::parse($request->get('date') ?: now()->toDateString())->toDateString();
        } catch (\Exception) {
            $targetDate = now()->toDateString();
        }

        $staffList = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        $records = Attendance::where('store_id', $store->id)
            ->where('date', $targetDate)
            ->get()->keyBy('user_id');

        $rows = $staffList->map(function (User $staff) use ($records) {
            $att   = $records->get($staff->id);
            $stats = $this->calcStats($att, $staff->schedule_start, $staff->schedule_end);
            return [
                'name'           => $staff->name,
                'sub_role'       => $staff->sub_role ?? '—',
                'schedule'       => ($staff->schedule_start && $staff->schedule_end) ? "{$staff->schedule_start} – {$staff->schedule_end}" : '—',
                'clock_in'       => $att?->clock_in?->format('h:i A') ?? '—',
                'clock_out'      => $att?->clock_out?->format('h:i A') ?? '—',
                'status'         => str_replace('_', ' ', $stats['status']),
                'hours_worked'   => number_format($stats['hours_worked'], 2),
                'overtime_hours' => number_format($stats['overtime'], 2),
                'notes'          => $att?->notes ?? '',
            ];
        })->values()->all();

        $dateLabel = \Carbon\Carbon::parse($targetDate)->format('M d, Y');
        $filename  = $this->exportFilename('attendance', $store->store_name, $targetDate, $targetDate, $format);

        $columns = [
            ['key' => 'name',           'label' => 'Name'],
            ['key' => 'sub_role',       'label' => 'Role'],
            ['key' => 'schedule',       'label' => 'Schedule'],
            ['key' => 'clock_in',       'label' => 'Clock In'],
            ['key' => 'clock_out',      'label' => 'Clock Out'],
            ['key' => 'status',         'label' => 'Status'],
            ['key' => 'hours_worked',   'label' => 'Hours',     'align' => 'right'],
            ['key' => 'overtime_hours', 'label' => 'Overtime',  'align' => 'right'],
            ['key' => 'notes',          'label' => 'Notes'],
        ];

        if ($format === 'pdf') {
            $present = collect($rows)->where('status', 'present')->count();
            $late    = collect($rows)->where('status', 'late')->count();
            $absent  = collect($rows)->where('status', 'absent')->count();
            return $this->pdfResponse($filename, [
                'title'        => "Attendance — {$dateLabel}",
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $dateLabel,
                'summaryItems' => [
                    ['label' => 'Total Staff', 'value' => count($rows)],
                    ['label' => 'Present',     'value' => $present],
                    ['label' => 'Late',        'value' => $late],
                    ['label' => 'Absent',      'value' => $absent],
                ],
                'columns' => $columns,
                'rows'    => $rows,
            ]);
        }

        $headings = ['Name', 'Role', 'Schedule', 'Clock In', 'Clock Out', 'Status', 'Hours', 'Overtime', 'Notes'];
        $csvRows  = array_map(fn ($r) => array_values($r), $rows);
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    public function clockIn(Request $request): RedirectResponse
    {
        if (! $this->canManage()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');

        $request->validate([
            'user_id' => ['required', 'integer'],
            'date'    => ['nullable', 'date'],
        ]);

        $staff = User::where('id', $request->user_id)
            ->where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->firstOrFail();

        // Block clock-in if no schedule assigned (BUG 1)
        if (! $staff->schedule_start || ! $staff->schedule_end) {
            return back()->with('error', "{$staff->name} cannot clock in — no schedule assigned.");
        }

        $date = $request->date ?? now()->toDateString();

        $att = Attendance::firstOrCreate(
            ['user_id' => $staff->id, 'date' => $date],
            ['store_id' => $store->id, 'status' => 'absent']
        );

        if ($att->clock_in) {
            return back()->with('error', "{$staff->name} is already clocked in.");
        }

        $clockIn = now();
        $stats   = $this->calcStats(
            (clone $att)->fill(['clock_in' => $clockIn]),
            $staff->schedule_start,
            $staff->schedule_end
        );

        $att->update([
            'clock_in' => $clockIn,
            'status'   => $stats['status'],
            'is_late'  => $stats['is_late'],
        ]);

        return back()->with('success', "{$staff->name} clocked in at {$clockIn->format('h:i A')}.");
    }

    public function clockOut(Request $request): RedirectResponse
    {
        if (! $this->canManage()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');

        $request->validate([
            'user_id' => ['required', 'integer'],
            'date'    => ['nullable', 'date'],
        ]);

        $staff = User::where('id', $request->user_id)
            ->where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->firstOrFail();

        $date = $request->date ?? now()->toDateString();

        $att = Attendance::where('user_id', $staff->id)
            ->where('date', $date)
            ->first();

        if (! $att || ! $att->clock_in) {
            return back()->with('error', "{$staff->name} has not clocked in yet.");
        }

        if ($att->clock_out) {
            return back()->with('error', "{$staff->name} is already clocked out.");
        }

        $clockOut = now();
        $att->update(['clock_out' => $clockOut]);

        $stats = $this->calcStats($att->fresh(), $staff->schedule_start, $staff->schedule_end);

        $att->update([
            'status'         => $stats['status'],
            'is_late'        => $stats['is_late'],
            'overtime_hours' => $stats['overtime'],
        ]);

        return back()->with('success', "{$staff->name} clocked out at {$clockOut->format('h:i A')}.");
    }

    // ── Set clock-out manually (for missing clock-out records) ───────────────

    public function setClockOut(Request $request): RedirectResponse
    {
        if (! $this->canManage()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');

        $request->validate([
            'user_id'    => ['required', 'integer'],
            'date'       => ['required', 'date'],
            'clock_out'  => ['required', 'date_format:H:i'],
        ]);

        $staff = User::where('id', $request->user_id)
            ->where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->firstOrFail();

        $att = Attendance::where('user_id', $staff->id)
            ->where('date', $request->date)
            ->first();

        if (! $att || ! $att->clock_in) {
            return back()->with('error', "{$staff->name} has no clock-in record for this date.");
        }

        if ($att->clock_out) {
            return back()->with('error', "{$staff->name} already has a clock-out time.");
        }

        $clockOutTime = Carbon::parse("{$request->date} {$request->clock_out}");

        if ($clockOutTime->lte($att->clock_in)) {
            return back()->with('error', 'Clock-out time must be after clock-in time.');
        }

        $att->update(['clock_out' => $clockOutTime]);

        $stats = $this->calcStats($att->fresh(), $staff->schedule_start, $staff->schedule_end);

        $att->update([
            'status'         => $stats['status'],
            'is_late'        => $stats['is_late'],
            'overtime_hours' => $stats['overtime'],
        ]);

        return back()->with('success', "Clock-out set for {$staff->name} at {$clockOutTime->format('h:i A')}.");
    }

    // ── Staff self-service ────────────────────────────────────────────────────

    public function myAttendance(Request $request): Response
    {
        $user = $request->user();

        // HR staff are managed by the Owner — they don't have a self-service attendance page
        if ($user->role === 'seller_staff' && $user->sub_role === 'hr') {
            abort(403, 'HR staff do not have a self-service attendance page.');
        }

        $today = now()->toDateString();

        $att = Attendance::where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        $stats = $this->calcStats($att, $user->schedule_start, $user->schedule_end);

        // Recalculate and persist values if changed
        if ($att && $att->status !== 'day_off') {
            $dirty = [];
            if ($att->status !== $stats['status'])                   $dirty['status']         = $stats['status'];
            if ((float)$att->overtime_hours !== $stats['overtime'])  $dirty['overtime_hours'] = $stats['overtime'];
            if ((bool)$att->is_late !== $stats['is_late'])           $dirty['is_late']        = $stats['is_late'];
            if ($dirty) $att->update($dirty);
        }

        // Last 7 days history
        $history = Attendance::where('user_id', $user->id)
            ->where('date', '<', $today)
            ->orderByDesc('date')
            ->limit(7)
            ->get()
            ->map(fn ($a) => [
                'date'      => $a->date->format('M d, Y'),
                'clock_in'  => $a->clock_in?->format('h:i A'),
                'clock_out' => $a->clock_out?->format('h:i A'),
                'status'    => $a->status,
            ])
            ->values();

        return Inertia::render('seller/my-attendance', [
            'today'          => now()->format('M d, Y'),
            'schedule_start' => $user->schedule_start,
            'schedule_end'   => $user->schedule_end,
            'attendance'     => $att ? [
                'id'            => $att->id,
                'clock_in'      => $att->clock_in?->format('h:i A'),
                'clock_out'     => $att->clock_out?->format('h:i A'),
                'status'        => $stats['status'],
                'is_late'       => $stats['is_late'],
                'hours_worked'  => $stats['hours_worked'],
                'overtime_hours'=> $stats['overtime'],
            ] : null,
            'history' => $history,
        ]);
    }

    public function myClockIn(Request $request): RedirectResponse
    {
        $user = $request->user();

        // HR staff are clocked in by the Owner — they cannot self-clock
        if ($user->role === 'seller_staff' && $user->sub_role === 'hr') {
            abort(403, 'HR staff cannot self-clock. Please contact the store owner.');
        }

        // Block clock-in if no schedule assigned (BUG 1)
        if (! $user->schedule_start || ! $user->schedule_end) {
            return back()->with('error', 'Cannot clock in — no schedule assigned. Contact your manager.');
        }

        $storeId = $request->attributes->get('seller_store')?->id ?? $user->store_id;
        $today   = now()->toDateString();

        $att = Attendance::firstOrCreate(
            ['user_id' => $user->id, 'date' => $today],
            ['store_id' => $storeId, 'status' => 'absent']
        );

        if ($att->clock_in) {
            return back()->with('error', 'You have already clocked in today.');
        }

        $clockIn = now();
        $stats   = $this->calcStats(
            (clone $att)->fill(['clock_in' => $clockIn]),
            $user->schedule_start,
            $user->schedule_end
        );

        $att->update([
            'clock_in' => $clockIn,
            'status'   => $stats['status'],
            'is_late'  => $stats['is_late'],
        ]);

        return back()->with('success', "Clocked in at {$clockIn->format('h:i A')}.");
    }

    public function myClockOut(Request $request): RedirectResponse
    {
        $user = $request->user();

        // HR staff are clocked out by the Owner — they cannot self-clock
        if ($user->role === 'seller_staff' && $user->sub_role === 'hr') {
            abort(403, 'HR staff cannot self-clock. Please contact the store owner.');
        }

        $today = now()->toDateString();

        $att = Attendance::where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        if (! $att || ! $att->clock_in) {
            return back()->with('error', 'You have not clocked in yet today.');
        }

        if ($att->clock_out) {
            return back()->with('error', 'You have already clocked out today.');
        }

        $clockOut = now();
        $att->update(['clock_out' => $clockOut]);

        $stats = $this->calcStats($att->fresh(), $user->schedule_start, $user->schedule_end);

        $att->update([
            'status'         => $stats['status'],
            'is_late'        => $stats['is_late'],
            'overtime_hours' => $stats['overtime'],
        ]);

        return back()->with('success', "Clocked out at {$clockOut->format('h:i A')}.");
    }
}
