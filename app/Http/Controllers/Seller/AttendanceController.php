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
     * Calculate status, hours worked, and overtime for an attendance record.
     * All times are in Asia/Manila (app default).
     *
     * @param  Attendance|null  $attendance
     * @param  string|null      $scheduleStart  e.g. "08:00" or "08:00:00"
     * @param  string|null      $scheduleEnd
     * @return array{status:string, hours_worked:float, overtime:float}
     */
    private function calcStats(?Attendance $attendance, ?string $scheduleStart, ?string $scheduleEnd): array
    {
        if (! $attendance || ! $attendance->clock_in) {
            return ['status' => 'absent', 'hours_worked' => 0.0, 'overtime' => 0.0];
        }

        $clockIn  = $attendance->clock_in;
        $clockOut = $attendance->clock_out;

        // Hours worked so far (or until clock-out)
        $hoursWorked = $clockOut
            ? round($clockIn->diffInMinutes($clockOut) / 60, 2)
            : 0.0;

        // Scheduled duration in hours
        $scheduledHours = 0.0;
        if ($scheduleStart && $scheduleEnd) {
            $today          = $clockIn->format('Y-m-d');
            $start          = Carbon::parse("{$today} {$scheduleStart}");
            $end            = Carbon::parse("{$today} {$scheduleEnd}");
            $scheduledHours = max(0.0, $start->diffInMinutes($end) / 60);
        }

        // Determine status
        $status = $attendance->status; // keep existing if manually set to day_off

        if ($status !== 'day_off') {
            if ($scheduleStart) {
                $today        = $clockIn->format('Y-m-d');
                $scheduled    = Carbon::parse("{$today} {$scheduleStart}");
                $lateThreshold = (clone $scheduled)->addMinutes(15);

                if ($clockIn->lte($lateThreshold)) {
                    $status = 'present';
                } else {
                    $status = 'late';
                }

                // Override to half_day if clocked out and worked < half of scheduled
                if ($clockOut && $scheduledHours > 0 && $hoursWorked < ($scheduledHours / 2)) {
                    $status = 'half_day';
                }
            } else {
                // No schedule set — present if clocked in
                $status = 'present';
            }
        }

        // Overtime = hours beyond scheduled duration (only if clocked out)
        $overtime = 0.0;
        if ($clockOut && $scheduledHours > 0) {
            $overtime = max(0.0, round($hoursWorked - $scheduledHours, 2));
        }

        return [
            'status'       => $status,
            'hours_worked' => $hoursWorked,
            'overtime'     => $overtime,
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

            // Persist calculated status back to DB if it has changed
            if ($att && $att->status !== $stats['status'] && $att->status !== 'day_off') {
                $att->update([
                    'status'         => $stats['status'],
                    'overtime_hours' => $stats['overtime'],
                ]);
            }

            return [
                'user_id'        => $staff->id,
                'name'           => $staff->name,
                'sub_role'       => $staff->sub_role,
                'schedule_start' => $staff->schedule_start,
                'schedule_end'   => $staff->schedule_end,
                'attendance_id'  => $att?->id,
                'clock_in'       => $att?->clock_in?->format('h:i A'),
                'clock_out'      => $att?->clock_out?->format('h:i A'),
                'status'         => $stats['status'],
                'hours_worked'   => $stats['hours_worked'],
                'overtime_hours' => $stats['overtime'],
                'notes'          => $att?->notes,
            ];
        })->values();

        $summary = [
            'total'    => $rows->count(),
            'present'  => $rows->where('status', 'present')->count(),
            'late'     => $rows->where('status', 'late')->count(),
            'absent'   => $rows->where('status', 'absent')->count(),
            'half_day' => $rows->where('status', 'half_day')->count(),
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
            'overtime_hours' => $stats['overtime'],
        ]);

        return back()->with('success', "{$staff->name} clocked out at {$clockOut->format('h:i A')}.");
    }

    // ── Staff self-service ────────────────────────────────────────────────────

    public function myAttendance(Request $request): Response
    {
        $user  = $request->user();
        $today = now()->toDateString();

        $att = Attendance::where('user_id', $user->id)
            ->where('date', $today)
            ->first();

        $stats = $this->calcStats($att, $user->schedule_start, $user->schedule_end);

        // Recalculate and persist status if changed
        if ($att && $att->status !== $stats['status'] && $att->status !== 'day_off') {
            $att->update([
                'status'         => $stats['status'],
                'overtime_hours' => $stats['overtime'],
            ]);
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
                'id'        => $att->id,
                'clock_in'  => $att->clock_in?->format('h:i A'),
                'clock_out' => $att->clock_out?->format('h:i A'),
                'status'    => $stats['status'],
                'hours_worked'   => $stats['hours_worked'],
                'overtime_hours' => $stats['overtime'],
            ] : null,
            'history' => $history,
        ]);
    }

    public function myClockIn(Request $request): RedirectResponse
    {
        $user    = $request->user();
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
        ]);

        return back()->with('success', "Clocked in at {$clockIn->format('h:i A')}.");
    }

    public function myClockOut(Request $request): RedirectResponse
    {
        $user  = $request->user();
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
            'overtime_hours' => $stats['overtime'],
        ]);

        return back()->with('success', "Clocked out at {$clockOut->format('h:i A')}.");
    }
}
