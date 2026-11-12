import { Head, Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, BadgeDollarSign, ClipboardList, Eye, RefreshCw } from 'lucide-react';
import { ExportLink } from '@/components/export-link';
import { PayrollTabs } from '@/components/payroll-tabs';
import { PAYROLL_STATUS_STYLE, peso, rateSourceLabel, type PayrollSummary } from '@/components/payslip-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
    payrolls: PayrollSummary[];
    period_start: string;
    period_end: string;
    settings: {
        payroll_period: string;
        overtime_multiplier: number;
    };
    is_owner: boolean;
    /** Owner or Payroll Full access */
    can_generate?: boolean;
    /** Owner only: roles with active staff but no hourly rate (their staff get no payslip) */
    roles_without_rate?: string[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Payroll', href: '/seller/payroll' },
];

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', released: 'Released', paid: 'Paid' };

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYROLL_STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PayrollPage({ payrolls, period_start, period_end, is_owner, can_generate = is_owner, roles_without_rate = [] }: Props) {
    const generateForm = useForm({ period_start, period_end });
    const releaseForm  = useForm({});
    const paidForm     = useForm({});

    function handleFilter(field: 'period_start' | 'period_end', value: string) {
        router.get('/seller/payroll', {
            period_start: field === 'period_start' ? value : period_start,
            period_end:   field === 'period_end'   ? value : period_end,
        }, { preserveState: false });
    }

    const totalNet = payrolls.reduce((s, r) => s + r.net_pay, 0);
    const hasDaily = payrolls.some((r) => r.pay_basis === 'daily');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll" />

            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">

                {/* Header */}
                <div data-tour="pr-header" className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                            <BadgeDollarSign className="h-6 w-6 text-blue-600" />
                            Payroll
                        </h1>
                        <p className="mt-0.5 text-sm text-gray-500">Hourly pay from attendance — whole hours, per day.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-sm">
                            <label className="text-gray-500">From</label>
                            <input type="date" value={period_start} onChange={(e) => handleFilter('period_start', e.target.value)}
                                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                            <label className="text-gray-500">To</label>
                            <input type="date" value={period_end} onChange={(e) => handleFilter('period_end', e.target.value)}
                                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
                        </div>
                        {can_generate && (
                            <Button size="sm" disabled={generateForm.processing} className="gap-1.5"
                                // The form holds the current period (changing a date reloads the page without preserving state)
                                onClick={() => generateForm.post('/seller/payroll/generate', { preserveScroll: true })}>
                                <RefreshCw className="h-3.5 w-3.5" /> Generate
                            </Button>
                        )}
                        <ExportLink href={`/seller/payroll/export?format=csv&period_start=${period_start}&period_end=${period_end}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
                            CSV
                        </ExportLink>
                        <ExportLink href={`/seller/payroll/export?format=pdf&period_start=${period_start}&period_end=${period_end}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
                            PDF
                        </ExportLink>
                    </div>
                </div>

                {is_owner && <PayrollTabs active="payslips" />}

                {can_generate && (
                    <p className="-mt-2 text-xs text-gray-500">
                        Generate makes or updates <strong>draft</strong> payslips. Drafts use current rates and schedules; released and paid payslips are never changed.
                    </p>
                )}

                {is_owner && roles_without_rate.length > 0 && (
                    <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                            <strong>{roles_without_rate.join(', ')}</strong> {roles_without_rate.length === 1 ? 'has' : 'have'} no hourly rate yet — their staff can't get a payslip.
                        </span>
                        <Link href="/seller/payroll/settings" className="font-medium underline underline-offset-2 hover:text-amber-700">Set rates →</Link>
                    </div>
                )}

                {/* Summary */}
                {payrolls.length > 0 && (
                    <div data-tour="pr-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            { label: 'Staff Count', value: payrolls.length, cls: 'text-gray-800' },
                            { label: 'Total Net Pay', value: peso(totalNet), cls: 'text-blue-700' },
                            { label: 'Released', value: payrolls.filter((r) => r.status === 'released' || r.status === 'paid').length, cls: 'text-emerald-600' },
                            { label: 'Paid', value: payrolls.filter((r) => r.status === 'paid').length, cls: 'text-emerald-700' },
                        ].map((c) => (
                            <Card key={c.label}>
                                <CardHeader className="px-4 pt-4 pb-1">
                                    <CardTitle className="text-xs font-medium tracking-wide text-gray-500 uppercase">{c.label}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Table */}
                <Card data-tour="pr-table">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ClipboardList className="h-4 w-4 text-blue-600" />
                            Payroll Records
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {payrolls.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ClipboardList className="mb-3 h-10 w-10" />
                                <p className="font-medium">No payroll records yet</p>
                                <p className="mt-1 text-sm">Click "Generate" to create payroll for the selected period.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                            <th className="px-4 py-3">Staff</th>
                                            <th className="px-4 py-3 text-center">Days</th>
                                            <th className="px-4 py-3 text-right">Regular h</th>
                                            <th className="px-4 py-3 text-right">OT h</th>
                                            <th className="px-4 py-3 text-right">Rate/h</th>
                                            {hasDaily && <th className="px-4 py-3 text-right">Daily rate</th>}
                                            <th className="px-4 py-3 text-right">Net Pay</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {payrolls.map((row) => {
                                            const hourly = row.pay_basis === 'hourly';
                                            return (
                                                <tr key={row.id} className="hover:bg-gray-50/60">
                                                    <td className="px-4 py-3">
                                                        <Link href={`/seller/payroll/${row.id}`} className="font-medium text-gray-900 hover:text-blue-700 hover:underline">{row.name}</Link>
                                                        <p className="text-xs text-gray-500">{row.role_names.length ? row.role_names.join(', ') : row.sub_role}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                                                        <span className="text-gray-700">{row.days_present}P</span>
                                                        {row.days_late > 0 && <span className="text-yellow-600"> · {row.days_late}L</span>}
                                                        {row.days_absent > 0 && <span className="text-red-600"> · {row.days_absent}A</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono">{hourly ? row.regular_hours : '—'}</td>
                                                    <td className="px-4 py-3 text-right font-mono">{hourly ? row.overtime_hours_paid : row.total_overtime_hours}</td>
                                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                                        {hourly ? (
                                                            <>
                                                                <span className="font-mono">{peso(row.hourly_rate)}</span>
                                                                <span className="block text-[11px] text-gray-400">{rateSourceLabel(row.rate_source)}</span>
                                                            </>
                                                        ) : '—'}
                                                    </td>
                                                    {hasDaily && <td className="px-4 py-3 text-right font-mono text-gray-500">{hourly ? '—' : peso(row.daily_rate)}</td>}
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{peso(row.net_pay)}</td>
                                                    <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                                                <Link href={`/seller/payroll/${row.id}`}><Eye className="mr-1 h-3.5 w-3.5" /> View</Link>
                                                            </Button>
                                                            {is_owner && row.status === 'draft' && row.net_pay > 0 && (
                                                                <Button size="sm" disabled={releaseForm.processing}
                                                                    onClick={() => releaseForm.patch(`/seller/payroll/${row.id}/release`, { preserveScroll: true })}
                                                                    className="h-7 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700">
                                                                    Release
                                                                </Button>
                                                            )}
                                                            {is_owner && row.status === 'released' && row.net_pay > 0 && (
                                                                <Button size="sm" disabled={paidForm.processing}
                                                                    onClick={() => paidForm.patch(`/seller/payroll/${row.id}/paid`, { preserveScroll: true })}
                                                                    className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700">
                                                                    Mark Paid
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
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
