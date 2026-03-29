<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\StorePayRate;
use App\Models\StorePayrollSettings;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PayrollController extends Controller
{
    use GeneratesExport;
    private function isOwner(): bool
    {
        return auth()->user()->role === 'seller';
    }

    private function canView(): bool
    {
        $user = auth()->user();
        return $user->role === 'seller'
            || ($user->role === 'seller_staff' && $user->sub_role === 'hr');
    }

    /**
     * Resolve the daily rate for a staff member:
     * individual override > store role rate > default 500.
     */
    private function resolveRate(User $staff, int $storeId): float
    {
        if ($staff->daily_rate_override !== null) {
            return (float) $staff->daily_rate_override;
        }

        $rate = StorePayRate::where('store_id', $storeId)
            ->where('sub_role', $staff->sub_role)
            ->value('daily_rate');

        return $rate !== null ? (float) $rate : 500.0;
    }

    /**
     * Calculate payroll figures for a staff member over a date range.
     */
    private function calcPayroll(
        User $staff,
        int $storeId,
        string $periodStart,
        string $periodEnd,
        StorePayrollSettings $settings,
        float $dailyRate
    ): array {
        $records = Attendance::where('user_id', $staff->id)
            ->where('store_id', $storeId)
            ->whereBetween('date', [$periodStart, $periodEnd])
            ->get();

        $daysPresent  = $records->whereIn('status', ['present'])->count();
        $daysLate     = $records->where('status', 'late')->count();
        $daysAbsent   = $records->where('status', 'absent')->count();
        $daysHalfDay  = $records->where('status', 'half_day')->count();
        $totalOT      = (float) $records->sum('overtime_hours');

        // Payroll formula
        $basicPay       = $dailyRate * ($daysPresent + $daysLate + $daysHalfDay * 0.5);
        $overtimePay    = $totalOT * ($dailyRate / 8 * (float) $settings->overtime_multiplier);
        $lateDeduction  = $daysLate * (float) $settings->late_deduction_per_day;
        $absentDeduction= $daysAbsent * $dailyRate;
        $grossPay       = $basicPay + $overtimePay;
        $netPay         = $grossPay - $lateDeduction - $absentDeduction;

        return [
            'days_present'         => $daysPresent,
            'days_late'            => $daysLate,
            'days_absent'          => $daysAbsent,
            'days_half_day'        => $daysHalfDay,
            'total_overtime_hours' => round($totalOT, 2),
            'daily_rate'           => $dailyRate,
            'basic_pay'            => round($basicPay, 2),
            'overtime_pay'         => round($overtimePay, 2),
            'late_deduction'       => round($lateDeduction, 2),
            'absent_deduction'     => round($absentDeduction, 2),
            'gross_pay'            => round($grossPay, 2),
            'net_pay'              => round(max(0, $netPay), 2),
        ];
    }

    // ── List payrolls ─────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        if (! $this->canView()) {
            abort(403);
        }

        $store    = $request->attributes->get('seller_store');
        $authUser = auth()->user();

        // Default period = current month
        $periodStart = $request->get('period_start') ?: now()->startOfMonth()->toDateString();
        $periodEnd   = $request->get('period_end')   ?: now()->endOfMonth()->toDateString();

        $payrolls = Payroll::with('user')
            ->where('store_id', $store->id)
            ->where('period_start', $periodStart)
            ->where('period_end',   $periodEnd)
            ->get();

        // HR: hide own row
        if (! $this->isOwner()) {
            $payrolls = $payrolls->filter(fn ($p) => $p->user_id !== $authUser->id)->values();
        }

        $settings = StorePayrollSettings::firstOrCreate(
            ['store_id' => $store->id],
            ['payroll_period' => 'monthly', 'overtime_multiplier' => 1.25, 'late_deduction_per_day' => 50.00]
        );

        $payRates = StorePayRate::where('store_id', $store->id)
            ->pluck('daily_rate', 'sub_role');

        return Inertia::render('seller/payroll', [
            'payrolls'     => $payrolls->map(fn ($p) => [
                'id'                   => $p->id,
                'user_id'              => $p->user_id,
                'name'                 => $p->user->name,
                'sub_role'             => $p->user->sub_role,
                'period_start'         => $p->period_start->toDateString(),
                'period_end'           => $p->period_end->toDateString(),
                'days_present'         => $p->days_present,
                'days_late'            => $p->days_late,
                'days_absent'          => $p->days_absent,
                'days_half_day'        => $p->days_half_day,
                'total_overtime_hours' => (float) $p->total_overtime_hours,
                'daily_rate'           => (float) $p->daily_rate,
                'basic_pay'            => (float) $p->basic_pay,
                'overtime_pay'         => (float) $p->overtime_pay,
                'late_deduction'       => (float) $p->late_deduction,
                'absent_deduction'     => (float) $p->absent_deduction,
                'gross_pay'            => (float) $p->gross_pay,
                'net_pay'              => (float) $p->net_pay,
                'status'               => $p->status,
                'released_at'          => $p->released_at?->toDateTimeString(),
                'paid_at'              => $p->paid_at?->toDateTimeString(),
            ])->values(),
            'period_start' => $periodStart,
            'period_end'   => $periodEnd,
            'settings'     => [
                'payroll_period'         => $settings->payroll_period,
                'overtime_multiplier'    => (float) $settings->overtime_multiplier,
                'late_deduction_per_day' => (float) $settings->late_deduction_per_day,
            ],
            'pay_rates'    => $payRates,
            'is_owner'     => $this->isOwner(),
        ]);
    }

    public function export(Request $request)
    {
        if (! $this->canView()) abort(403);

        $store       = $request->attributes->get('seller_store');
        $format      = $request->get('format', 'csv');
        $periodStart = $request->get('period_start') ?: now()->startOfMonth()->toDateString();
        $periodEnd   = $request->get('period_end')   ?: now()->endOfMonth()->toDateString();

        $payrolls = Payroll::with('user')
            ->where('store_id', $store->id)
            ->where('period_start', $periodStart)
            ->where('period_end',   $periodEnd)
            ->get();

        if (! $this->isOwner()) {
            $payrolls = $payrolls->filter(fn ($p) => $p->user_id !== auth()->id())->values();
        }

        $filename = $this->exportFilename('payroll', $store->store_name, $periodStart, $periodEnd, $format);

        $columns = [
            ['key' => 'name',           'label' => 'Name'],
            ['key' => 'sub_role',       'label' => 'Role'],
            ['key' => 'days_present',   'label' => 'Present',    'align' => 'right'],
            ['key' => 'days_late',      'label' => 'Late',       'align' => 'right'],
            ['key' => 'days_absent',    'label' => 'Absent',     'align' => 'right'],
            ['key' => 'days_half_day',  'label' => 'Half Day',   'align' => 'right'],
            ['key' => 'ot_hours',       'label' => 'OT Hrs',     'align' => 'right'],
            ['key' => 'daily_rate',     'label' => 'Daily Rate', 'align' => 'right'],
            ['key' => 'basic_pay',      'label' => 'Basic Pay',  'align' => 'right'],
            ['key' => 'overtime_pay',   'label' => 'OT Pay',     'align' => 'right'],
            ['key' => 'deductions',     'label' => 'Deductions', 'align' => 'right'],
            ['key' => 'net_pay',        'label' => 'Net Pay',    'align' => 'right'],
            ['key' => 'status',         'label' => 'Status'],
        ];

        $rows = $payrolls->map(fn ($p) => [
            'name'          => $p->user->name,
            'sub_role'      => $p->user->sub_role ?? '—',
            'days_present'  => $p->days_present,
            'days_late'     => $p->days_late,
            'days_absent'   => $p->days_absent,
            'days_half_day' => $p->days_half_day,
            'ot_hours'      => number_format((float) $p->total_overtime_hours, 2),
            'daily_rate'    => $this->peso((float) $p->daily_rate),
            'basic_pay'     => $this->peso((float) $p->basic_pay),
            'overtime_pay'  => $this->peso((float) $p->overtime_pay),
            'deductions'    => $this->peso((float) $p->late_deduction + (float) $p->absent_deduction),
            'net_pay'       => $this->peso((float) $p->net_pay),
            'status'        => $p->status,
            '_net'          => (float) $p->net_pay,
        ])->values()->all();

        $totalNet = collect($rows)->sum('_net');
        $dateLabel = \Carbon\Carbon::parse($periodStart)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($periodEnd)->format('M d, Y');

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Payroll Summary',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $dateLabel,
                'summaryItems' => [
                    ['label' => 'Period',     'value' => $dateLabel],
                    ['label' => 'Staff',      'value' => count($rows)],
                    ['label' => 'Total Payout', 'value' => $this->peso($totalNet)],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => array_merge(array_fill_keys(array_column($columns, 'key'), ''), ['name' => 'TOTAL', 'net_pay' => $this->peso($totalNet)]),
            ]);
        }

        $headings = ['Name', 'Role', 'Present', 'Late', 'Absent', 'Half Day', 'OT Hrs', 'Daily Rate', 'Basic Pay', 'OT Pay', 'Deductions', 'Net Pay', 'Status'];
        $csvRows  = array_map(fn ($r) => [$r['name'], $r['sub_role'], $r['days_present'], $r['days_late'], $r['days_absent'], $r['days_half_day'], $r['ot_hours'], $r['daily_rate'], $r['basic_pay'], $r['overtime_pay'], $r['deductions'], $r['net_pay'], $r['status']], $rows);
        $csvRows[] = ['TOTAL', '', '', '', '', '', '', '', '', '', '', $this->peso($totalNet), ''];
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    // ── Generate / regenerate payroll for the period ──────────────────────────

    public function generate(Request $request): RedirectResponse
    {
        if (! $this->canView()) {
            abort(403);
        }

        $request->validate([
            'period_start' => ['required', 'date'],
            'period_end'   => ['required', 'date', 'after_or_equal:period_start'],
        ]);

        $store    = $request->attributes->get('seller_store');
        $authUser = auth()->user();

        $settings = StorePayrollSettings::firstOrCreate(
            ['store_id' => $store->id],
            ['payroll_period' => 'monthly', 'overtime_multiplier' => 1.25, 'late_deduction_per_day' => 50.00]
        );

        $staffList = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->get();

        // HR: filter self out
        if (! $this->isOwner()) {
            $staffList = $staffList->filter(fn ($s) => $s->id !== $authUser->id);
        }

        foreach ($staffList as $staff) {
            // Skip staff with no attendance records in the period
            $hasAttendance = Attendance::where('user_id', $staff->id)
                ->where('store_id', $store->id)
                ->whereBetween('date', [$request->period_start, $request->period_end])
                ->exists();

            if (! $hasAttendance) {
                continue;
            }

            $dailyRate = $this->resolveRate($staff, $store->id);
            $calc      = $this->calcPayroll(
                $staff,
                $store->id,
                $request->period_start,
                $request->period_end,
                $settings,
                $dailyRate
            );

            Payroll::updateOrCreate(
                [
                    'store_id'     => $store->id,
                    'user_id'      => $staff->id,
                    'period_start' => $request->period_start,
                    'period_end'   => $request->period_end,
                ],
                $calc + ['status' => 'draft']
            );
        }

        return back()->with('success', 'Payroll generated successfully.');
    }

    // ── Mark Released ─────────────────────────────────────────────────────────

    public function markReleased(Request $request, Payroll $payroll): RedirectResponse
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');
        if ($payroll->store_id !== $store->id) {
            abort(403);
        }

        $payroll->update(['status' => 'released', 'released_at' => now()]);

        return back()->with('success', 'Payroll marked as released.');
    }

    // ── Mark Paid ─────────────────────────────────────────────────────────────

    public function markPaid(Request $request, Payroll $payroll): RedirectResponse
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');
        if ($payroll->store_id !== $store->id) {
            abort(403);
        }

        $payroll->update(['status' => 'paid', 'paid_at' => now()]);

        return back()->with('success', 'Payroll marked as paid.');
    }

    // ── Payroll Settings page ─────────────────────────────────────────────────

    public function settings(Request $request): Response
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');

        $settings = StorePayrollSettings::firstOrCreate(
            ['store_id' => $store->id],
            ['payroll_period' => 'monthly', 'overtime_multiplier' => 1.25, 'late_deduction_per_day' => 50.00]
        );

        $payRates = StorePayRate::where('store_id', $store->id)
            ->get()
            ->keyBy('sub_role')
            ->map(fn ($r) => (float) $r->daily_rate);

        // Ensure all sub_roles exist
        foreach (['cashier', 'warehouse', 'rider', 'hr'] as $subRole) {
            if (! isset($payRates[$subRole])) {
                StorePayRate::firstOrCreate(
                    ['store_id' => $store->id, 'sub_role' => $subRole],
                    ['daily_rate' => 500.00]
                );
                $payRates[$subRole] = 500.0;
            }
        }

        // Staff with individual rate overrides
        $staffRates = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->whereNotNull('daily_rate_override')
            ->get()
            ->map(fn ($u) => [
                'id'                  => $u->id,
                'name'                => $u->name,
                'sub_role'            => $u->sub_role,
                'daily_rate_override' => (float) $u->daily_rate_override,
            ]);

        return Inertia::render('seller/payroll-settings', [
            'settings'   => [
                'payroll_period'         => $settings->payroll_period,
                'overtime_multiplier'    => (float) $settings->overtime_multiplier,
                'late_deduction_per_day' => (float) $settings->late_deduction_per_day,
            ],
            'pay_rates'  => $payRates,
            'staff_rates'=> $staffRates,
        ]);
    }

    public function updateSettings(Request $request): RedirectResponse
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');

        $data = $request->validate([
            'payroll_period'         => ['required', 'in:weekly,bi_weekly,monthly'],
            'overtime_multiplier'    => ['required', 'numeric', 'min:1', 'max:3'],
            'late_deduction_per_day' => ['required', 'numeric', 'min:0'],
            'pay_rates'              => ['nullable', 'array'],
            'pay_rates.*'            => ['numeric', 'min:0'],
        ]);

        StorePayrollSettings::updateOrCreate(
            ['store_id' => $store->id],
            [
                'payroll_period'         => $data['payroll_period'],
                'overtime_multiplier'    => $data['overtime_multiplier'],
                'late_deduction_per_day' => $data['late_deduction_per_day'],
            ]
        );

        if (! empty($data['pay_rates'])) {
            foreach ($data['pay_rates'] as $subRole => $rate) {
                StorePayRate::updateOrCreate(
                    ['store_id' => $store->id, 'sub_role' => $subRole],
                    ['daily_rate' => $rate]
                );
            }
        }

        return back()->with('success', 'Payroll settings saved.');
    }

    public function updateStaffRate(Request $request, User $user): RedirectResponse
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');
        if ($user->store_id !== $store->id) {
            abort(403);
        }

        $data = $request->validate([
            'daily_rate_override' => ['nullable', 'numeric', 'min:0'],
        ]);

        $user->update(['daily_rate_override' => $data['daily_rate_override'] ?: null]);

        return back()->with('success', 'Staff rate updated.');
    }

    // ── My Payslips (self — all seller_staff and riders) ──────────────────────

    public function myPayslips(Request $request): Response
    {
        $user = $request->user();

        $payslips = Payroll::with('store')
            ->where('user_id', $user->id)
            ->whereIn('status', ['released', 'paid'])
            ->orderByDesc('period_start')
            ->get()
            ->map(fn ($p) => [
                'id'                   => $p->id,
                'store_name'           => $p->store->store_name ?? '—',
                'period_start'         => $p->period_start->toDateString(),
                'period_end'           => $p->period_end->toDateString(),
                'days_present'         => $p->days_present,
                'days_late'            => $p->days_late,
                'days_absent'          => $p->days_absent,
                'days_half_day'        => $p->days_half_day,
                'total_overtime_hours' => (float) $p->total_overtime_hours,
                'daily_rate'           => (float) $p->daily_rate,
                'basic_pay'            => (float) $p->basic_pay,
                'overtime_pay'         => (float) $p->overtime_pay,
                'late_deduction'       => (float) $p->late_deduction,
                'absent_deduction'     => (float) $p->absent_deduction,
                'gross_pay'            => (float) $p->gross_pay,
                'net_pay'              => (float) $p->net_pay,
                'status'               => $p->status,
                'released_at'          => $p->released_at?->format('M d, Y'),
                'paid_at'              => $p->paid_at?->format('M d, Y'),
            ]);

        $isRider = $user->role === 'rider'
            || ($user->role === 'seller_staff' && $user->sub_role === 'rider');

        return Inertia::render('seller/my-payslips', [
            'payslips'  => $payslips,
            'user_name' => $user->name,
            'sub_role'  => $user->sub_role ?? $user->role,
            'is_rider'  => $isRider,
        ]);
    }
}
