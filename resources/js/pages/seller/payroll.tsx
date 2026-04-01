import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    BadgeDollarSign,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    FileDown,
    RefreshCw,
    Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type PayrollRow = {
    id: number;
    user_id: number;
    name: string;
    sub_role: string;
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
    status: 'draft' | 'released' | 'paid';
    released_at: string | null;
    paid_at: string | null;
};

type Props = {
    payrolls: PayrollRow[];
    period_start: string;
    period_end: string;
    settings: {
        payroll_period: string;
        overtime_multiplier: number;
        late_deduction_per_day: number;
    };
    pay_rates: Record<string, number>;
    is_owner: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Payroll', href: '/seller/payroll' },
];

const STATUS_STYLE: Record<string, string> = {
    draft:    'bg-gray-100 text-gray-600',
    released: 'bg-blue-100 text-blue-700',
    paid:     'bg-emerald-100 text-emerald-700',
};

const SUB_ROLE_STYLE: Record<string, string> = {
    cashier:   'bg-emerald-100 text-emerald-700',
    warehouse: 'bg-amber-100 text-amber-700',
    rider:     'bg-blue-100 text-blue-700',
    hr:        'bg-purple-100 text-purple-700',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const labels: Record<string, string> = { draft: 'Draft', released: 'Released', paid: 'Paid' };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
            {labels[status] ?? status}
        </span>
    );
}

function RoleBadge({ role }: { role: string }) {
    const labels: Record<string, string> = { cashier: 'Cashier', warehouse: 'Warehouse', rider: 'Rider', hr: 'HR' };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUB_ROLE_STYLE[role] ?? 'bg-gray-100 text-gray-500'}`}>
            {labels[role] ?? role}
        </span>
    );
}

function ExpandedRow({ row }: { row: PayrollRow }) {
    return (
        <tr className="bg-blue-50/40">
            <td colSpan={9} className="px-6 py-4">
                <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Daily Rate</p>
                        <p className="font-semibold text-gray-800">{peso(row.daily_rate)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Basic Pay</p>
                        <p className="font-semibold text-gray-800">{peso(row.basic_pay)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Overtime Pay</p>
                        <p className="font-semibold text-emerald-700">{peso(row.overtime_pay)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Gross Pay</p>
                        <p className="font-semibold text-gray-800">{peso(row.gross_pay)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Late Deduction</p>
                        <p className="font-semibold text-orange-600">−{peso(row.late_deduction)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Absent Deduction</p>
                        <p className="font-semibold text-red-600">−{peso(row.absent_deduction)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Undertime Deduction</p>
                        <p className="font-semibold text-red-500">−{peso(row.undertime_deduction)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">OT Hours</p>
                        <p className="font-semibold text-gray-800">{row.total_overtime_hours}h</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">Attendance</p>
                        <p className="font-semibold text-gray-800">
                            {row.days_present}P · {row.days_late}L · {row.days_half_day}HD · {row.days_absent}A
                        </p>
                    </div>
                </div>
            </td>
        </tr>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollPage({ payrolls, period_start, period_end, settings, is_owner }: Props) {
    const [expanded, setExpanded] = useState<number | null>(null);

    const generateForm = useForm({
        period_start,
        period_end,
    });

    const releaseForm = useForm({});
    const paidForm    = useForm({});

    function handleFilter(field: 'period_start' | 'period_end', value: string) {
        router.get('/seller/payroll', {
            period_start: field === 'period_start' ? value : period_start,
            period_end:   field === 'period_end'   ? value : period_end,
        }, { preserveState: false });
    }

    const totalNet = payrolls.reduce((s, r) => s + r.net_pay, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <BadgeDollarSign className="h-6 w-6 text-blue-600" />
                            Payroll
                        </h1>
                        <p className="mt-0.5 text-sm text-gray-500">Manage staff payroll for your store.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-sm">
                            <label className="text-gray-500">From</label>
                            <input
                                type="date"
                                value={period_start}
                                onChange={e => handleFilter('period_start', e.target.value)}
                                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                            <label className="text-gray-500">To</label>
                            <input
                                type="date"
                                value={period_end}
                                onChange={e => handleFilter('period_end', e.target.value)}
                                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <Button
                            size="sm"
                            disabled={generateForm.processing}
                            onClick={() => generateForm.post('/seller/payroll/generate', {
                                preserveScroll: true,
                                data: { period_start, period_end },
                            })}
                            className="gap-1.5"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Generate
                        </Button>
                        {is_owner && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.get('/seller/payroll/settings')}
                                className="gap-1.5"
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                Settings
                            </Button>
                        )}
                        <a href={`/seller/payroll/export?format=csv&period_start=${period_start}&period_end=${period_end}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/payroll/export?format=pdf&period_start=${period_start}&period_end=${period_end}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Summary */}
                {payrolls.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Staff Count</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-gray-800">{payrolls.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Net Pay</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-blue-700">{peso(totalNet)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Released</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-emerald-600">
                                    {payrolls.filter(r => r.status === 'released' || r.status === 'paid').length}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-1 pt-4 px-4">
                                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <p className="text-2xl font-bold text-emerald-700">
                                    {payrolls.filter(r => r.status === 'paid').length}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-blue-600" />
                            Payroll Records
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {payrolls.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ClipboardList className="mb-3 h-10 w-10" />
                                <p className="font-medium">No payroll records yet</p>
                                <p className="text-sm mt-1">Click "Generate" to create payroll for the selected period.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Staff</th>
                                            <th className="px-4 py-3 text-center">Present</th>
                                            <th className="px-4 py-3 text-center">Late</th>
                                            <th className="px-4 py-3 text-center">Absent</th>
                                            <th className="px-4 py-3 text-right">Net Pay</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            {is_owner && <th className="px-4 py-3 text-right">Actions</th>}
                                            <th className="px-4 py-3 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {payrolls.map((row) => (
                                            <>
                                                <tr key={row.id} className="hover:bg-gray-50/60">
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-900">{row.name}</p>
                                                        <div className="mt-0.5">
                                                            <RoleBadge role={row.sub_role} />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-gray-700">{row.days_present}</td>
                                                    <td className="px-4 py-3 text-center text-yellow-600">{row.days_late}</td>
                                                    <td className="px-4 py-3 text-center text-red-600">{row.days_absent}</td>
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{peso(row.net_pay)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <StatusBadge status={row.status} />
                                                    </td>
                                                    {is_owner && (
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {row.status === 'draft' && row.net_pay > 0 && (
                                                                    <Button
                                                                        size="sm"
                                                                        disabled={releaseForm.processing}
                                                                        onClick={() => releaseForm.patch(`/seller/payroll/${row.id}/release`, { preserveScroll: true })}
                                                                        className="h-7 text-xs px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                                                    >
                                                                        Release
                                                                    </Button>
                                                                )}
                                                                {row.status === 'released' && row.net_pay > 0 && (
                                                                    <Button
                                                                        size="sm"
                                                                        disabled={paidForm.processing}
                                                                        onClick={() => paidForm.patch(`/seller/payroll/${row.id}/paid`, { preserveScroll: true })}
                                                                        className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                    >
                                                                        Mark Paid
                                                                    </Button>
                                                                )}
                                                                {row.status === 'paid' && (
                                                                    <span className="text-xs text-gray-400 italic">Done</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                                                            className="text-gray-400 hover:text-gray-600"
                                                        >
                                                            {expanded === row.id
                                                                ? <ChevronUp className="h-4 w-4" />
                                                                : <ChevronDown className="h-4 w-4" />}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {expanded === row.id && <ExpandedRow key={`exp-${row.id}`} row={row} />}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
