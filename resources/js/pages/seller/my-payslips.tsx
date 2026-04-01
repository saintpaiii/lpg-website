import { Head } from '@inertiajs/react';
import {
    BadgeDollarSign,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    ClipboardList,
} from 'lucide-react';
import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Payslip = {
    id: number;
    store_name: string;
    period_start: string;
    period_end: string;
    days_present: number;
    days_late: number;
    days_absent: number;
    days_half_day: number;
    total_overtime_hours: number;
    daily_rate: number;
    basic_pay: number;
    overtime_pay: number;
    late_deduction: number;
    absent_deduction: number;
    undertime_deduction: number;
    gross_pay: number;
    net_pay: number;
    status: 'released' | 'paid';
    released_at: string | null;
    paid_at: string | null;
};

type Props = {
    payslips: Payslip[];
    user_name: string;
    sub_role: string;
    is_rider: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
    released: 'bg-blue-100 text-blue-700',
    paid:     'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<string, string> = {
    released: 'Released',
    paid:     'Paid',
};

const SUB_ROLE_LABEL: Record<string, string> = {
    cashier:   'Cashier',
    warehouse: 'Warehouse',
    rider:     'Rider',
    hr:        'HR',
    seller:    'Owner',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

function fmtPeriod(start: string, end: string) {
    return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// ── Payslip Detail Modal ────────────────────────────────────────────────────────

function PayslipModal({
    payslip,
    userName,
    subRole,
    open,
    onClose,
}: {
    payslip: Payslip | null;
    userName: string;
    subRole: string;
    open: boolean;
    onClose: () => void;
}) {
    if (!payslip) return null;

    const totalDeductions = payslip.late_deduction + payslip.absent_deduction + (payslip.undertime_deduction ?? 0);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BadgeDollarSign className="h-5 w-5 text-blue-600" />
                        Payslip
                    </DialogTitle>
                </DialogHeader>

                {/* Store + Employee header */}
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 space-y-0.5">
                    <p className="text-xs text-blue-500 uppercase tracking-wide font-semibold">{payslip.store_name}</p>
                    <p className="text-base font-bold text-gray-900">{userName}</p>
                    <p className="text-sm text-gray-500">{SUB_ROLE_LABEL[subRole] ?? subRole}</p>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {fmtPeriod(payslip.period_start, payslip.period_end)}
                    </p>
                </div>

                {/* Attendance breakdown */}
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Attendance</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                            { label: 'Present', value: payslip.days_present, color: 'text-emerald-700' },
                            { label: 'Late',    value: payslip.days_late,    color: 'text-yellow-600' },
                            { label: 'Half Day',value: payslip.days_half_day,color: 'text-orange-600' },
                            { label: 'Absent',  value: payslip.days_absent,  color: 'text-red-600'    },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-lg border bg-gray-50 py-2">
                                <p className={`text-xl font-bold ${color}`}>{value}</p>
                                <p className="text-xs text-gray-400">{label}</p>
                            </div>
                        ))}
                    </div>
                    {payslip.total_overtime_hours > 0 && (
                        <p className="mt-2 text-xs text-orange-600 font-medium text-center">
                            +{payslip.total_overtime_hours}h overtime
                        </p>
                    )}
                </div>

                {/* Earnings */}
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Earnings</p>
                    <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">
                                Basic Pay
                                <span className="text-xs text-gray-400 ml-1">
                                    ({payslip.days_present + payslip.days_late + payslip.days_half_day * 0.5} days × {peso(payslip.daily_rate)})
                                </span>
                            </span>
                            <span className="font-medium text-gray-800">{peso(payslip.basic_pay)}</span>
                        </div>
                        {payslip.overtime_pay > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-500">Overtime Pay</span>
                                <span className="font-medium text-emerald-700">+{peso(payslip.overtime_pay)}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-t pt-1.5 font-semibold">
                            <span className="text-gray-700">Gross Pay</span>
                            <span className="text-gray-900">{peso(payslip.gross_pay)}</span>
                        </div>
                    </div>
                </div>

                {/* Deductions */}
                {totalDeductions > 0 && (
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Deductions</p>
                        <div className="space-y-1.5 text-sm">
                            {payslip.late_deduction > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Late Deduction ({payslip.days_late} day{payslip.days_late !== 1 ? 's' : ''})</span>
                                    <span className="font-medium text-orange-600">−{peso(payslip.late_deduction)}</span>
                                </div>
                            )}
                            {payslip.absent_deduction > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Absent Deduction ({payslip.days_absent} day{payslip.days_absent !== 1 ? 's' : ''})</span>
                                    <span className="font-medium text-red-600">−{peso(payslip.absent_deduction)}</span>
                                </div>
                            )}
                            {(payslip.undertime_deduction ?? 0) > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Undertime Deduction</span>
                                    <span className="font-medium text-red-500">−{peso(payslip.undertime_deduction)}</span>
                                </div>
                            )}
                            <div className="flex justify-between border-t pt-1.5 font-semibold">
                                <span className="text-gray-700">Total Deductions</span>
                                <span className="text-red-600">−{peso(totalDeductions)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Net Pay */}
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between">
                    <span className="font-semibold text-emerald-700">Net Pay</span>
                    <span className="text-2xl font-bold text-emerald-800">{peso(payslip.net_pay)}</span>
                </div>

                {/* Status footer */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[payslip.status]}`}>
                        {STATUS_LABEL[payslip.status]}
                    </span>
                    <span>
                        {payslip.status === 'paid' && payslip.paid_at
                            ? `Paid on ${payslip.paid_at}`
                            : payslip.released_at
                            ? `Released on ${payslip.released_at}`
                            : ''}
                    </span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MyPayslipsPage({ payslips, user_name, sub_role, is_rider }: Props) {
    const [selected, setSelected] = useState<Payslip | null>(null);

    const dashboardHref = is_rider ? '/rider/deliveries' : '/seller/dashboard';
    const selfHref      = is_rider ? '/rider/my-payslips' : '/seller/my-payslips';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: is_rider ? 'My Deliveries' : 'Dashboard', href: dashboardHref },
        { title: 'My Payslips', href: selfHref },
    ];

    const totalEarned = payslips
        .filter(p => p.status === 'paid')
        .reduce((s, p) => s + p.net_pay, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Payslips" />

            <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl mx-auto w-full">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                        My Payslips
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">Your salary history — released and paid payrolls.</p>
                </div>

                {/* Summary */}
                {payslips.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Payslips</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-gray-800">{payslips.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Earned (Paid)</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-emerald-700">{peso(totalEarned)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Payment</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-blue-600">
                                    {payslips.filter(p => p.status === 'released').length}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Payslip list */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BadgeDollarSign className="h-4 w-4 text-blue-600" />
                            Payslip History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {payslips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ClipboardList className="mb-3 h-10 w-10" />
                                <p className="font-medium">No payslips yet</p>
                                <p className="text-sm mt-1">Your salary records will appear here once released.</p>
                            </div>
                        ) : (
                            <>
                                {/* Desktop table */}
                                <div className="hidden sm:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                <th className="px-4 py-3">Period</th>
                                                <th className="px-4 py-3 text-center">P</th>
                                                <th className="px-4 py-3 text-center">L</th>
                                                <th className="px-4 py-3 text-center">A</th>
                                                <th className="px-4 py-3 text-right">Daily Rate</th>
                                                <th className="px-4 py-3 text-right">Gross</th>
                                                <th className="px-4 py-3 text-right">Deductions</th>
                                                <th className="px-4 py-3 text-right">Net Pay</th>
                                                <th className="px-4 py-3 text-center">Status</th>
                                                <th className="px-4 py-3 w-8"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {payslips.map((p) => (
                                                <tr
                                                    key={p.id}
                                                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                                                    onClick={() => setSelected(p)}
                                                >
                                                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">
                                                        {fmtPeriod(p.period_start, p.period_end)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-medium text-emerald-700">{p.days_present}</td>
                                                    <td className="px-4 py-3 text-center font-medium text-yellow-600">{p.days_late}</td>
                                                    <td className="px-4 py-3 text-center font-medium text-red-500">{p.days_absent}</td>
                                                    <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">{peso(p.daily_rate)}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-gray-700">{peso(p.gross_pay)}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-red-500">
                                                        {p.late_deduction + p.absent_deduction + (p.undertime_deduction ?? 0) > 0
                                                            ? `−${peso(p.late_deduction + p.absent_deduction + (p.undertime_deduction ?? 0))}`
                                                            : <span className="text-gray-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{peso(p.net_pay)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                                                            {STATUS_LABEL[p.status]}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-400">
                                                        <ChevronDown className="h-4 w-4" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile card list */}
                                <div className="sm:hidden divide-y divide-gray-100">
                                    {payslips.map((p) => (
                                        <button
                                            key={p.id}
                                            className="w-full text-left px-4 py-4 hover:bg-blue-50/40 transition-colors"
                                            onClick={() => setSelected(p)}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                                        <CalendarDays className="h-3 w-3 shrink-0" />
                                                        {fmtPeriod(p.period_start, p.period_end)}
                                                    </p>
                                                    <p className="mt-1 text-sm text-gray-500">
                                                        {p.days_present}P · {p.days_late}L · {p.days_absent}A
                                                        {p.days_half_day > 0 && ` · ${p.days_half_day}HD`}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-base font-bold text-blue-700">{peso(p.net_pay)}</p>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5 ${STATUS_STYLE[p.status]}`}>
                                                        {STATUS_LABEL[p.status]}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <PayslipModal
                payslip={selected}
                userName={user_name}
                subRole={sub_role}
                open={selected !== null}
                onClose={() => setSelected(null)}
            />
        </AppLayout>
    );
}
