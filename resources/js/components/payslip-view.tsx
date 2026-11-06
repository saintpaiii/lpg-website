import { CalendarDays } from 'lucide-react';

// ── Types (PayrollController::row / ::payslip) ─────────────────────────────────

export type PayslipLine = {
    date: string;
    day: string;
    /** worked | no_clock_out | no_schedule | day_off | absent */
    kind: string;
    clock_in: string | null;
    clock_out: string | null;
    worked: string | null;
    worked_min: number;
    break_min: number;
    regular_h: number;
    ot_h: number;
    is_late: boolean;
    late_minutes: number;
    is_extra_day: boolean;
    pay: number;
    note: string;
};

export type PayslipRules = {
    rate_source: string | null;
    overtime_multiplier: number;
    meal_break_paid: boolean;
    meal_break_minutes: number;
    meal_break_after_hours: number;
    schedule: string | null;
};

/** One payroll row (lists). 'daily' = older payslips made with a daily rate. */
export type PayrollSummary = {
    id: number;
    user_id: number;
    name: string;
    sub_role: string | null;
    role_names: string[];
    store_name: string | null;
    period_start: string;
    period_end: string;
    pay_basis: 'hourly' | 'daily';
    hourly_rate: number | null;
    rate_source: string | null;
    regular_hours: number;
    overtime_hours_paid: number;
    daily_rate: number | null;
    days_present: number;
    days_late: number;
    days_absent: number;
    days_half_day: number;
    total_overtime_hours: number;
    basic_pay: number;
    overtime_pay: number;
    late_deduction: number;
    absent_deduction: number;
    undertime_deduction: number;
    gross_pay: number;
    net_pay: number;
    status: 'draft' | 'released' | 'paid';
    released_at: string | null;
    paid_at: string | null;
};

export type PayslipData = PayrollSummary & { lines: PayslipLine[]; rules: PayslipRules | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

export function peso(n: number | null | undefined) {
    return '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDay(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtPeriod(start: string, end: string) {
    return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** "role: Cashier" / "personal rate" / "store default" */
export function rateSourceLabel(source: string | null | undefined) {
    if (source === 'personal') return 'personal rate';
    if (source?.startsWith('role:')) return `role: ${source.slice(5)}`;
    return 'store default';
}

/** Trim trailing zeros: 1.25 → "1.25", 5.00 → "5" */
const num = (n: number) => String(Number(n.toFixed(2)));

export function smallPrint(rules: PayslipRules | null) {
    if (!rules) return '';
    const brk = rules.meal_break_paid
        ? 'Meal break: paid'
        : `Meal break: unpaid ${rules.meal_break_minutes} min (when ${num(rules.meal_break_after_hours)}+ hours worked)`;
    return `${rules.schedule ? `Shift ${rules.schedule} · ` : ''}${brk} · Whole hours only · Late time is unpaid`;
}

export const PAYROLL_STATUS_STYLE: Record<string, string> = {
    draft:    'bg-gray-100 text-gray-600',
    released: 'bg-blue-100 text-blue-700',
    paid:     'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', released: 'Released', paid: 'Paid' };

// ── Component ──────────────────────────────────────────────────────────────────

export function PayslipView({ p }: { p: PayslipData }) {
    const hourly = p.pay_basis === 'hourly';
    const rate = p.hourly_rate ?? 0;
    const mult = p.rules?.overtime_multiplier ?? 1.25;
    const deductions = p.late_deduction + p.absent_deduction + (p.undertime_deduction ?? 0);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        {p.store_name && <p className="text-xs font-semibold tracking-wide text-blue-500 uppercase">{p.store_name}</p>}
                        <p className="text-base font-bold text-gray-900 dark:text-gray-100">{p.name}</p>
                        <p className="text-sm text-gray-500">{p.role_names.length ? p.role_names.join(', ') : p.sub_role}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                            <CalendarDays className="h-3.5 w-3.5" /> {fmtPeriod(p.period_start, p.period_end)}
                        </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PAYROLL_STATUS_STYLE[p.status] ?? ''}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                </div>
                {hourly && (
                    <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                        Rate: {peso(rate)}/hour <span className="font-normal text-gray-500">({rateSourceLabel(p.rate_source)})</span>
                    </p>
                )}
            </div>

            {hourly ? (
                <>
                    {/* Day by day */}
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase dark:bg-gray-900">
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Day</th>
                                    <th className="px-3 py-2">In</th>
                                    <th className="px-3 py-2">Out</th>
                                    <th className="px-3 py-2 text-right">Worked</th>
                                    <th className="px-3 py-2 text-right">Break</th>
                                    <th className="px-3 py-2 text-right">Regular h</th>
                                    <th className="px-3 py-2 text-right">OT h</th>
                                    <th className="px-3 py-2 text-right">Pay</th>
                                    <th className="px-3 py-2">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {p.lines.length === 0 && (
                                    <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No days in this period.</td></tr>
                                )}
                                {p.lines.map((l) => {
                                    const empty = l.kind === 'day_off' || l.kind === 'absent';
                                    const unpaid = l.kind === 'no_clock_out' || l.kind === 'no_schedule';
                                    return (
                                        <tr key={l.date} className={l.kind === 'day_off' ? 'text-gray-400' : ''}>
                                            <td className="px-3 py-1.5 whitespace-nowrap">{new Date(l.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
                                            <td className="px-3 py-1.5">{l.day}</td>
                                            <td className="px-3 py-1.5 whitespace-nowrap">{l.clock_in ?? '—'}</td>
                                            <td className="px-3 py-1.5 whitespace-nowrap">{l.clock_out ?? '—'}</td>
                                            <td className="px-3 py-1.5 text-right font-mono">{l.worked ?? '—'}</td>
                                            <td className="px-3 py-1.5 text-right">{l.break_min ? `${l.break_min} min` : '—'}</td>
                                            <td className="px-3 py-1.5 text-right font-mono">{empty ? '—' : l.regular_h}</td>
                                            <td className="px-3 py-1.5 text-right font-mono">{empty ? '—' : l.ot_h}</td>
                                            <td className="px-3 py-1.5 text-right font-mono">{empty ? '—' : peso(l.pay)}</td>
                                            <td className={`px-3 py-1.5 text-xs ${unpaid ? 'font-medium text-red-600' : l.kind === 'absent' ? 'text-red-500' : l.is_late ? 'text-amber-600' : l.is_extra_day ? 'text-blue-600' : ''}`}>
                                                {l.note}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="space-y-1.5 rounded-lg border p-4 text-sm">
                        <div className="flex justify-between gap-3">
                            <span className="text-gray-600">Regular {p.regular_hours} h × {peso(rate)}</span>
                            <span className="font-mono">{peso(p.basic_pay)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-gray-600">Overtime {p.overtime_hours_paid} h × {peso(rate * mult)} (×{num(mult)})</span>
                            <span className="font-mono">{peso(p.overtime_pay)}</span>
                        </div>
                        <div className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
                            <span>Gross</span>
                            <span className="font-mono">{peso(p.gross_pay)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Net pay</span>
                            <span className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{peso(p.net_pay)}</span>
                        </div>
                        <p className="pt-1 text-xs text-gray-500">
                            {p.days_present} day{p.days_present === 1 ? '' : 's'} worked · {p.days_late} late · {p.days_absent} absent
                        </p>
                        <p className="text-[11px] text-gray-400">{smallPrint(p.rules)}</p>
                    </div>
                </>
            ) : (
                <div className="space-y-1.5 rounded-lg border p-4 text-sm">
                    <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Older payslip (daily rate) — no day-by-day breakdown.
                    </p>
                    <div className="flex justify-between"><span className="text-gray-600">Daily rate</span><span className="font-mono">{peso(p.daily_rate)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Days</span><span>{p.days_present} present · {p.days_late} late · {p.days_half_day} half day · {p.days_absent} absent</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Basic pay</span><span className="font-mono">{peso(p.basic_pay)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Overtime ({p.total_overtime_hours} h)</span><span className="font-mono">{peso(p.overtime_pay)}</span></div>
                    <div className="flex justify-between border-t pt-1.5 font-semibold"><span>Gross</span><span className="font-mono">{peso(p.gross_pay)}</span></div>
                    {deductions > 0 && <div className="flex justify-between text-red-600"><span>Deductions</span><span className="font-mono">−{peso(deductions)}</span></div>}
                    <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
                        <span className="font-semibold text-emerald-700">Net pay</span>
                        <span className="text-xl font-bold text-emerald-800">{peso(p.net_pay)}</span>
                    </div>
                </div>
            )}

            {(p.released_at || p.paid_at) && (
                <p className="text-right text-xs text-gray-400">
                    {p.status === 'paid' && p.paid_at ? `Paid on ${p.paid_at}` : p.released_at ? `Released on ${p.released_at}` : ''}
                </p>
            )}
        </div>
    );
}
