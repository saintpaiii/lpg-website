import { Head, Link } from '@inertiajs/react';
import { BadgeDollarSign, CalendarDays, ChevronRight, ClipboardList, FileDown } from 'lucide-react';
import { fmtPeriod, PAYROLL_STATUS_STYLE, peso, type PayrollSummary } from '@/components/payslip-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Props = {
    payslips: (PayrollSummary & { status: 'released' | 'paid' })[];
    user_name: string;
    sub_role: string;
    is_rider: boolean;
};

const STATUS_LABEL: Record<string, string> = { released: 'Released', paid: 'Paid' };

/** "160 h + 6 h OT × ₱65.00" for hourly payslips, "₱500.00/day" for older ones */
function payLine(p: PayrollSummary) {
    if (p.pay_basis === 'hourly') {
        return `${p.regular_hours} h${p.overtime_hours_paid ? ` + ${p.overtime_hours_paid} h OT` : ''} × ${peso(p.hourly_rate)}/h`;
    }
    return `${peso(p.daily_rate)}/day (older payslip)`;
}

export default function MyPayslipsPage({ payslips, is_rider }: Props) {
    const base = is_rider ? '/rider/my-payslips' : '/seller/my-payslips';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: is_rider ? 'My Deliveries' : 'Dashboard', href: is_rider ? '/rider/deliveries' : '/seller/dashboard' },
        { title: 'My Payslips', href: base },
    ];

    const totalEarned = payslips.filter((p) => p.status === 'paid').reduce((s, p) => s + p.net_pay, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Payslips" />

            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                        My Payslips
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">Your salary history — released and paid payrolls. Open one to see each day.</p>
                </div>

                {payslips.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                            { label: 'Total Payslips', value: payslips.length, cls: 'text-gray-800' },
                            { label: 'Total Earned (Paid)', value: peso(totalEarned), cls: 'text-emerald-700' },
                            { label: 'Pending Payment', value: payslips.filter((p) => p.status === 'released').length, cls: 'text-blue-600' },
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

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BadgeDollarSign className="h-4 w-4 text-blue-600" />
                            Payslip History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {payslips.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ClipboardList className="mb-3 h-10 w-10" />
                                <p className="font-medium">No payslips yet</p>
                                <p className="mt-1 text-sm">Your salary records will appear here once released.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                {payslips.map((p) => (
                                    <div key={p.id} className="flex items-center gap-2 px-4 py-3 hover:bg-blue-50/40">
                                        <Link href={`${base}/${p.id}`} className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1 text-sm font-medium text-gray-800">
                                                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                    {fmtPeriod(p.period_start, p.period_end)}
                                                </p>
                                                <p className="mt-0.5 text-xs text-gray-500">
                                                    {p.store_name} · {payLine(p)} · {p.days_present} day{p.days_present === 1 ? '' : 's'}
                                                    {p.days_late > 0 && ` · ${p.days_late} late`}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-base font-bold text-blue-700">{peso(p.net_pay)}</p>
                                                <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PAYROLL_STATUS_STYLE[p.status]}`}>
                                                    {STATUS_LABEL[p.status]}
                                                </span>
                                            </div>
                                        </Link>
                                        <a href={`${base}/${p.id}/pdf`} target="_blank" rel="noopener" title="Download PDF"
                                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                            <FileDown className="h-4 w-4" />
                                        </a>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
