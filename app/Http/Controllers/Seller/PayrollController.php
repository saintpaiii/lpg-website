<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\StorePayrollSettings;
use App\Models\StoreRole;
use App\Models\User;
use App\Services\PayrollCalculator;
use App\Services\StaffAccess;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store payroll — hourly pay per role (App\Services\PayrollCalculator has the rules).
 * Old payrolls (pay_basis 'daily') are kept and shown with their old daily-rate figures.
 */
class PayrollController extends Controller
{
    use GeneratesExport;

    private function isOwner(): bool
    {
        return auth()->user()->role === 'seller';
    }

    /** Owner, or staff with the Payroll module (View only or Full access). */
    private function canView(): bool
    {
        $user = auth()->user();
        return $user->role === 'seller' || $user->hasPermission('payroll.view') || $user->hasPermission('payroll.manage');
    }

    /** Owner, or staff with Full access to Payroll (generate). Release / paid / settings stay owner-only. */
    private function canGenerate(): bool
    {
        $user = auth()->user();
        return $user->role === 'seller' || $user->hasPermission('payroll.manage');
    }

    /** The rules shown on the payroll pages (and used by the live example on the settings page). */
    private static function rules(StorePayrollSettings $s): array
    {
        return [
            'payroll_period'         => $s->payroll_period,
            'overtime_multiplier'    => (float) $s->overtime_multiplier,
            'default_hourly_rate'    => (float) $s->default_hourly_rate,
            'meal_break_paid'        => (bool) $s->meal_break_paid,
            'meal_break_minutes'     => (int) $s->meal_break_minutes,
            'meal_break_after_hours' => (float) $s->meal_break_after_hours,
        ];
    }

    /** One payroll row for the lists (index / my payslips). */
    private static function row(Payroll $p, array $roleNames = []): array
    {
        $hourly = $p->pay_basis === 'hourly';

        return [
            'id'                   => $p->id,
            'user_id'              => $p->user_id,
            'name'                 => $p->user?->name ?? '—',
            'sub_role'             => $p->user?->sub_role,
            'role_names'           => $roleNames,
            'store_name'           => $p->relationLoaded('store') ? ($p->store?->store_name ?? '—') : null,
            'period_start'         => $p->period_start->toDateString(),
            'period_end'           => $p->period_end->toDateString(),
            'pay_basis'            => $hourly ? 'hourly' : 'daily',
            'hourly_rate'          => $hourly ? (float) $p->hourly_rate : null,
            'rate_source'          => $hourly ? ($p->breakdown['rules']['rate_source'] ?? null) : null,
            'regular_hours'        => (int) $p->regular_hours,
            'overtime_hours_paid'  => (int) $p->overtime_hours_paid,
            'daily_rate'           => $hourly ? null : (float) $p->daily_rate,
            'days_present'         => $p->days_present,
            'days_late'            => $p->days_late,
            'days_absent'          => $p->days_absent,
            'days_half_day'        => $p->days_half_day,
            'total_overtime_hours' => (float) $p->total_overtime_hours,
            'basic_pay'            => (float) $p->basic_pay,
            'overtime_pay'         => (float) $p->overtime_pay,
            'late_deduction'       => (float) $p->late_deduction,
            'absent_deduction'     => (float) $p->absent_deduction,
            'undertime_deduction'  => (float) ($p->undertime_deduction ?? 0),
            'gross_pay'            => (float) $p->gross_pay,
            'net_pay'              => (float) $p->net_pay,
            'status'               => $p->status,
            'released_at'          => $p->released_at?->format('M d, Y'),
            'paid_at'              => $p->paid_at?->format('M d, Y'),
        ];
    }

    /** Everything the payslip page / PDF shows. */
    private static function payslip(Payroll $p): array
    {
        $p->loadMissing(['user', 'store']);
        $hourly = $p->pay_basis === 'hourly';

        return self::row($p, $p->user ? StaffAccess::roleNames($p->user) : []) + [
            'lines' => $hourly ? ($p->breakdown['lines'] ?? []) : [],
            'rules' => $hourly ? ($p->breakdown['rules'] ?? null) : null,
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

        // A staff member with Payroll access never sees their own row
        if (! $this->isOwner()) {
            $payrolls = $payrolls->filter(fn ($p) => $p->user_id !== $authUser->id)->values();
        }
        $roleNames = StaffAccess::roleNamesFor($payrolls->pluck('user')->filter());

        $settings = StorePayrollSettings::forStore($store->id);

        return Inertia::render('seller/payroll', [
            'payrolls'     => $payrolls->map(fn ($p) => self::row($p, $roleNames[$p->user_id] ?? []))->values(),
            'period_start' => $periodStart,
            'period_end'   => $periodEnd,
            'settings'     => self::rules($settings),
            'is_owner'     => $this->isOwner(),
            'can_generate' => $this->canGenerate(),
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
        $roleNames = StaffAccess::roleNamesFor($payrolls->pluck('user')->filter());

        $filename = $this->exportFilename('payroll', $store->store_name, $periodStart, $periodEnd, $format);
        $hasDaily = $payrolls->contains(fn ($p) => $p->pay_basis !== 'hourly');

        $columns = array_values(array_filter([
            ['key' => 'name',         'label' => 'Name'],
            ['key' => 'roles',        'label' => 'Roles'],
            ['key' => 'days_present', 'label' => 'Present', 'align' => 'right'],
            ['key' => 'days_late',    'label' => 'Late',    'align' => 'right'],
            ['key' => 'days_absent',  'label' => 'Absent',  'align' => 'right'],
            ['key' => 'regular_h',    'label' => 'Regular h', 'align' => 'right'],
            ['key' => 'ot_h',         'label' => 'OT h',    'align' => 'right'],
            ['key' => 'rate',         'label' => 'Rate/h',  'align' => 'right'],
            // Older (daily-rate) payrolls only
            $hasDaily ? ['key' => 'daily_rate', 'label' => 'Daily Rate', 'align' => 'right'] : null,
            ['key' => 'basic_pay',    'label' => 'Basic Pay', 'align' => 'right'],
            ['key' => 'overtime_pay', 'label' => 'OT Pay',  'align' => 'right'],
            ['key' => 'deductions',   'label' => 'Deductions', 'align' => 'right'],
            ['key' => 'net_pay',      'label' => 'Net Pay', 'align' => 'right'],
            ['key' => 'status',       'label' => 'Status'],
        ]));

        $rows = $payrolls->map(function ($p) use ($roleNames) {
            $hourly = $p->pay_basis === 'hourly';
            return [
                'name'         => $p->user->name,
                'roles'        => implode(', ', $roleNames[$p->user_id] ?? []) ?: ($p->user->sub_role ?? '—'),
                'days_present' => $p->days_present,
                'days_late'    => $p->days_late,
                'days_absent'  => $p->days_absent,
                'regular_h'    => $hourly ? (int) $p->regular_hours : '—',
                'ot_h'         => $hourly ? (int) $p->overtime_hours_paid : number_format((float) $p->total_overtime_hours, 2),
                'rate'         => $hourly ? $this->peso((float) $p->hourly_rate) : '—',
                'daily_rate'   => $hourly ? '—' : $this->peso((float) $p->daily_rate),
                'basic_pay'    => $this->peso((float) $p->basic_pay),
                'overtime_pay' => $this->peso((float) $p->overtime_pay),
                'deductions'   => $this->peso((float) $p->late_deduction + (float) $p->absent_deduction + (float) ($p->undertime_deduction ?? 0)),
                'net_pay'      => $this->peso((float) $p->net_pay),
                'status'       => $p->status,
                '_net'         => (float) $p->net_pay,
            ];
        })->values()->all();

        $totalNet  = collect($rows)->sum('_net');
        $dateLabel = Carbon::parse($periodStart)->format('M d, Y') . ' – ' . Carbon::parse($periodEnd)->format('M d, Y');

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Payroll Summary',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => $dateLabel,
                'summaryItems' => [
                    ['label' => 'Period',       'value' => $dateLabel],
                    ['label' => 'Staff',        'value' => count($rows)],
                    ['label' => 'Total Payout', 'value' => $this->peso($totalNet)],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => array_merge(array_fill_keys(array_column($columns, 'key'), ''), ['name' => 'TOTAL', 'net_pay' => $this->peso($totalNet)]),
            ]);
        }

        $keys     = array_column($columns, 'key');
        $headings = array_column($columns, 'label');
        $csvRows  = array_map(fn ($r) => array_map(fn ($k) => $r[$k], $keys), $rows);
        $csvRows[] = array_map(fn ($k) => match ($k) { 'name' => 'TOTAL', 'net_pay' => $this->peso($totalNet), default => '' }, $keys);

        return $this->csvResponse($filename, $headings, $csvRows);
    }

    // ── Generate / regenerate payroll for the period ──────────────────────────

    public function generate(Request $request): RedirectResponse
    {
        if (! $this->canGenerate()) {
            abort(403);
        }

        $request->validate([
            'period_start' => ['required', 'date'],
            'period_end'   => ['required', 'date', 'after_or_equal:period_start'],
        ]);

        $store    = $request->attributes->get('seller_store');
        $authUser = auth()->user();
        $start    = Carbon::parse($request->period_start)->toDateString();
        $end      = Carbon::parse($request->period_end)->toDateString();

        $settings = StorePayrollSettings::forStore($store->id);

        $staffList = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->where('is_active', true)
            ->get();

        // Staff with Payroll access never generate their own payslip
        if (! $this->isOwner()) {
            $staffList = $staffList->filter(fn ($s) => $s->id !== $authUser->id);
        }

        $made = $locked = 0;
        foreach ($staffList as $staff) {
            // Skip staff with no attendance records in the period
            $hasAttendance = Attendance::where('user_id', $staff->id)
                ->where('store_id', $store->id)
                ->whereBetween('date', [$start, $end])
                ->exists();
            if (! $hasAttendance) {
                continue;
            }

            $existing = Payroll::withTrashed()
                ->where('store_id', $store->id)
                ->where('user_id', $staff->id)
                ->whereDate('period_start', $start)
                ->whereDate('period_end', $end)
                ->first();

            // Released / paid payslips are final — never recalculated
            if ($existing && ! $existing->trashed() && in_array($existing->status, ['released', 'paid'], true)) {
                $locked++;
                continue;
            }

            $calc = PayrollCalculator::calculate($staff, $store, $start, $end, $settings);
            unset($calc['rate_source']);   // kept in breakdown.rules
            $attrs = $calc + ['status' => 'draft', 'released_at' => null, 'paid_at' => null];

            if ($existing) {
                if ($existing->trashed()) {
                    $existing->restore();
                }
                $existing->fill($attrs)->save();
            } else {
                Payroll::create($attrs + [
                    'store_id' => $store->id, 'user_id' => $staff->id, 'period_start' => $start, 'period_end' => $end,
                ]);
            }
            $made++;
        }

        $msg = "Payroll generated for {$made} staff.";
        if ($locked > 0) {
            $msg .= " {$locked} already released/paid — not changed.";
        }

        return back()->with('success', $msg);
    }

    // ── Mark Released / Paid (owner) ──────────────────────────────────────────

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

    // ── Payslip (owner / Payroll staff) ───────────────────────────────────────

    /** Owner, or Payroll staff — but never their own payslip on the store side. */
    private function authorizeStorePayslip(Request $request, Payroll $payroll): void
    {
        $store = $request->attributes->get('seller_store');
        if ($payroll->store_id !== $store->id || ! $this->canView()) {
            abort(403);
        }
        if (! $this->isOwner() && $payroll->user_id === auth()->id()) {
            abort(403);
        }
    }

    public function show(Request $request, Payroll $payroll): Response
    {
        $this->authorizeStorePayslip($request, $payroll);

        return Inertia::render('seller/payslip', [
            'payslip'  => self::payslip($payroll),
            'mode'     => 'store',
            'is_rider' => false,
            'pdf_url'  => "/seller/payroll/{$payroll->id}/pdf",
            'back_url' => '/seller/payroll?' . http_build_query([
                'period_start' => $payroll->period_start->toDateString(),
                'period_end'   => $payroll->period_end->toDateString(),
            ]),
        ]);
    }

    public function pdf(Request $request, Payroll $payroll)
    {
        $this->authorizeStorePayslip($request, $payroll);

        return $this->payslipPdf($payroll);
    }

    // ── My payslips (self — store staff and riders) ───────────────────────────

    private static function isRiderUser(User $user): bool
    {
        return $user->role === 'rider' || ($user->role === 'seller_staff' && $user->sub_role === 'rider');
    }

    /** Only the person's own payslip, and only once released or paid — else 404. */
    private function ownPayslip(Request $request, Payroll $payroll): void
    {
        if ($payroll->user_id !== $request->user()->id || ! in_array($payroll->status, ['released', 'paid'], true)) {
            abort(404);
        }
    }

    public function myPayslips(Request $request): Response
    {
        $user = $request->user();

        $payslips = Payroll::with(['store', 'user'])
            ->where('user_id', $user->id)
            ->whereIn('status', ['released', 'paid'])
            ->orderByDesc('period_start')
            ->get()
            ->map(fn ($p) => self::row($p));

        return Inertia::render('seller/my-payslips', [
            'payslips'  => $payslips,
            'user_name' => $user->name,
            'sub_role'  => $user->sub_role ?? $user->role,
            'is_rider'  => self::isRiderUser($user),
        ]);
    }

    public function myPayslip(Request $request, Payroll $payroll): Response
    {
        $this->ownPayslip($request, $payroll);
        $isRider = self::isRiderUser($request->user());
        $base    = $isRider ? '/rider/my-payslips' : '/seller/my-payslips';

        return Inertia::render('seller/payslip', [
            'payslip'  => self::payslip($payroll),
            'mode'     => 'self',
            'is_rider' => $isRider,
            'pdf_url'  => "{$base}/{$payroll->id}/pdf",
            'back_url' => $base,
        ]);
    }

    public function myPayslipPdf(Request $request, Payroll $payroll)
    {
        $this->ownPayslip($request, $payroll);

        return $this->payslipPdf($payroll);
    }

    /** One payslip as a PDF: the day lines as the table, the totals as summary items. */
    private function payslipPdf(Payroll $payroll)
    {
        $data   = self::payslip($payroll);
        $store  = $payroll->store;
        $period = Carbon::parse($data['period_start'])->format('M d, Y') . ' – ' . Carbon::parse($data['period_end'])->format('M d, Y');
        $roles  = implode(', ', $data['role_names']) ?: ($data['sub_role'] ?? '—');
        $file   = $this->exportFilename('payslip', $data['name'], $data['period_start'], $data['period_end'], 'pdf');

        $summary = [
            ['label' => 'Staff',  'value' => $data['name']],
            ['label' => 'Roles',  'value' => $roles],
            ['label' => 'Status', 'value' => ucfirst($data['status'])],
        ];

        if ($data['pay_basis'] === 'hourly') {
            $rate  = (float) $data['hourly_rate'];
            $mult  = (float) ($data['rules']['overtime_multiplier'] ?? 1.25);
            $rules = $data['rules'] ?? [];
            $summary = array_merge($summary, [
                ['label' => 'Rate', 'value' => $this->peso($rate) . '/hour (' . PayrollCalculator::sourceLabel($data['rate_source']) . ')'],
                ['label' => 'Regular', 'value' => "{$data['regular_hours']} h × {$this->peso($rate)} = {$this->peso($data['basic_pay'])}"],
                ['label' => 'Overtime', 'value' => "{$data['overtime_hours_paid']} h × {$this->peso($rate * $mult)} (×{$mult}) = {$this->peso($data['overtime_pay'])}"],
                ['label' => 'Gross',   'value' => $this->peso($data['gross_pay'])],
                ['label' => 'Net pay', 'value' => $this->peso($data['net_pay'])],
            ]);
            $subtitle = self::smallPrint($rules);

            $columns = [
                ['key' => 'date',      'label' => 'Date'],
                ['key' => 'day',       'label' => 'Day'],
                ['key' => 'clock_in',  'label' => 'In'],
                ['key' => 'clock_out', 'label' => 'Out'],
                ['key' => 'worked',    'label' => 'Worked',    'align' => 'right'],
                ['key' => 'break',     'label' => 'Break',     'align' => 'right'],
                ['key' => 'regular_h', 'label' => 'Regular h', 'align' => 'right'],
                ['key' => 'ot_h',      'label' => 'OT h',      'align' => 'right'],
                ['key' => 'pay',       'label' => 'Pay',       'align' => 'right'],
                ['key' => 'note',      'label' => 'Note'],
            ];
            $rows = array_map(fn ($l) => [
                'date'      => Carbon::parse($l['date'])->format('M d'),
                'day'       => $l['day'],
                'clock_in'  => $l['clock_in'] ?? '—',
                'clock_out' => $l['clock_out'] ?? '—',
                'worked'    => $l['worked'] ?? '—',
                'break'     => $l['break_min'] ? "{$l['break_min']} min" : '—',
                'regular_h' => in_array($l['kind'], ['absent', 'day_off'], true) ? '—' : $l['regular_h'],
                'ot_h'      => in_array($l['kind'], ['absent', 'day_off'], true) ? '—' : $l['ot_h'],
                'pay'       => in_array($l['kind'], ['absent', 'day_off'], true) ? '—' : $this->peso((float) $l['pay']),
                'note'      => $l['note'],
            ], $data['lines']);
            $totals = ['date' => 'TOTAL', 'regular_h' => $data['regular_hours'], 'ot_h' => $data['overtime_hours_paid'], 'pay' => $this->peso($data['gross_pay'])];
        } else {
            $summary = array_merge($summary, [
                ['label' => 'Daily rate', 'value' => $this->peso((float) $data['daily_rate'])],
                ['label' => 'Days',       'value' => "{$data['days_present']} present · {$data['days_late']} late · {$data['days_absent']} absent"],
                ['label' => 'Basic pay',  'value' => $this->peso($data['basic_pay'])],
                ['label' => 'Overtime',   'value' => $this->peso($data['overtime_pay'])],
                ['label' => 'Deductions', 'value' => $this->peso($data['late_deduction'] + $data['absent_deduction'] + $data['undertime_deduction'])],
                ['label' => 'Net pay',    'value' => $this->peso($data['net_pay'])],
            ]);
            $subtitle = 'Older payslip (daily rate) — no day-by-day breakdown.';
            $columns  = [['key' => 'note', 'label' => 'Note']];
            $rows     = [];
            $totals   = null;
        }

        return $this->pdfResponse($file, array_filter([
            'title'        => 'Payslip',
            'orgName'      => $store?->store_name ?? '—',
            'orgSub'       => $store?->city ?? 'Cavite, Philippines',
            'dateRange'    => $period,
            'subtitle'     => $subtitle,
            'summaryItems' => $summary,
            'columns'      => $columns,
            'rows'         => $rows,
            'totalsRow'    => $totals,
        ], fn ($v) => $v !== null));
    }

    /** "Meal break: unpaid 60 min (when 5+ hours worked) · Whole hours only · Late time is unpaid" */
    private static function smallPrint(array $rules): string
    {
        $after = rtrim(rtrim(number_format((float) ($rules['meal_break_after_hours'] ?? 5), 2), '0'), '.');
        $break = ($rules['meal_break_paid'] ?? false)
            ? 'Meal break: paid'
            : "Meal break: unpaid {$rules['meal_break_minutes']} min (when {$after}+ hours worked)";
        $shift = ! empty($rules['schedule']) ? "Shift {$rules['schedule']} · " : '';

        return "{$shift}{$break} · Whole hours only · Late time is unpaid";
    }

    // ── Payroll Settings ──────────────────────────────────────────────────────

    public function settings(Request $request): Response
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store    = $request->attributes->get('seller_store');
        $settings = StorePayrollSettings::forStore($store->id);

        $roles = StoreRole::where('store_id', $store->id)
            ->withCount(['users as members_count' => fn ($q) => $q->whereNull('users.deleted_at')])
            ->orderByRaw('starter_key IS NULL')
            ->orderBy('id')
            ->get()
            ->map(fn ($r) => [
                'id'          => $r->id,
                'name'        => $r->name,
                'is_starter'  => $r->starter_key !== null,
                'is_rider'    => (bool) $r->is_rider,
                'members'     => (int) $r->members_count,
                'hourly_rate' => $r->hourly_rate !== null ? (float) $r->hourly_rate : null,
            ]);

        $staff = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->orderBy('name')
            ->get();
        $roleNames = StaffAccess::roleNamesFor($staff);

        return Inertia::render('seller/payroll-settings', [
            'settings' => self::rules($settings),
            'roles'    => $roles,
            'staff'    => $staff->map(function ($u) use ($store, $settings, $roleNames) {
                $eff = PayrollCalculator::hourlyRateFor($u, $store, $settings);
                return [
                    'id'                   => $u->id,
                    'name'                 => $u->name,
                    'role_names'           => $roleNames[$u->id] ?? [],
                    'hourly_rate_override' => $u->hourly_rate_override !== null ? (float) $u->hourly_rate_override : null,
                    'effective_rate'       => $eff['rate'],
                    'rate_source'          => $eff['source'],
                ];
            })->values(),
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
            'default_hourly_rate'    => ['required', 'numeric', 'min:0', 'max:10000'],
            'meal_break_paid'        => ['required', 'boolean'],
            'meal_break_minutes'     => ['required', 'integer', 'in:0,30,60'],
            'meal_break_after_hours' => ['required', 'numeric', 'min:1', 'max:12'],
            'rates'                  => ['nullable', 'array'],
            'rates.*'                => ['nullable', 'numeric', 'min:0', 'max:10000'],
        ], [
            'rates.*.numeric' => 'Enter an amount (or leave it empty to use the default).',
            'rates.*.max'     => 'At most ₱10,000 per hour.',
        ]);

        StorePayrollSettings::forStore($store->id)->update([
            'payroll_period'         => $data['payroll_period'],
            'overtime_multiplier'    => $data['overtime_multiplier'],
            'default_hourly_rate'    => $data['default_hourly_rate'],
            'meal_break_paid'        => (bool) $data['meal_break_paid'],
            'meal_break_minutes'     => (int) $data['meal_break_minutes'],
            'meal_break_after_hours' => $data['meal_break_after_hours'],
            'late_deduction_per_day' => 0,
        ]);

        // Hourly rate per role (only roles of this store); empty = uses the default
        foreach ($data['rates'] ?? [] as $roleId => $rate) {
            StoreRole::where('store_id', $store->id)->where('id', (int) $roleId)
                ->update(['hourly_rate' => ($rate === null || $rate === '') ? null : round((float) $rate, 2)]);
        }

        return back()->with('success', 'Payroll settings saved.');
    }

    /** Personal hourly rate of one staff member (wins over their roles); empty = remove it. */
    public function updateStaffRate(Request $request, User $user): RedirectResponse
    {
        if (! $this->isOwner()) {
            abort(403);
        }

        $store = $request->attributes->get('seller_store');
        if ($user->store_id !== $store->id || $user->role !== 'seller_staff') {
            abort(403);
        }

        $data = $request->validate([
            'hourly_rate_override' => ['nullable', 'numeric', 'min:0', 'max:10000'],
        ]);

        $rate = $data['hourly_rate_override'] ?? null;
        $user->update(['hourly_rate_override' => ($rate === null || $rate === '') ? null : round((float) $rate, 2)]);

        return back()->with('success', $rate === null || $rate === '' ? "Personal rate of {$user->name} removed." : "Personal rate of {$user->name} saved.");
    }
}
