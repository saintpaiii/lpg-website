import AppLayout from '@/layouts/app-layout';
import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, CalendarDays, CheckCircle2, FileDown, HandCoins, Info } from 'lucide-react';
import { InvoiceStatusBadge } from '@/components/commission-invoice-detail';
import { PayCommissionButton } from '@/components/pay-commission-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtPeso, type CommissionInvoice } from '@/lib/commission';
import type { BreadcrumbItem } from '@/types';

interface Summary {
    balance_owed: number;
    overdue_amount: number;
    next_due_date: string | null;
    this_month: number;
    total_paid: number;
    uninvoiced: number;
    suspended: boolean;
    suspend_after: number;
    billing_period: 'weekly' | 'monthly';
}

type Counts = { all: number; unpaid: number; paid: number };

interface Props {
    summary: Summary;
    counts: Counts;
    invoices: { data: CommissionInvoice[]; current_page: number; last_page: number };
    tab: string;
}

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Commission', href: '/seller/commission' }];

const TABS: { key: keyof Counts; label: string }[] = [
    { key: 'all',    label: 'All'    },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'paid',   label: 'Paid'   },
];

export default function SellerCommission({ summary, counts, invoices, tab }: Props) {
    const hasOverdue = summary.overdue_amount > 0;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Commission" />

            <div className="p-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><HandCoins className="h-6 w-6 text-blue-600" /> Commission</h1>
                    <p className="text-sm text-muted-foreground">
                        Platform commission invoices for your completed orders. Pay online through PayMongo.
                    </p>
                </div>

                {/* Balance owed */}
                <Card className={hasOverdue ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : summary.balance_owed > 0 ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : ''}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Current balance owed</p>
                            <p className={`text-3xl font-bold ${hasOverdue ? 'text-red-600' : summary.balance_owed > 0 ? 'text-amber-700' : 'text-green-600'}`}>
                                {fmtPeso(summary.balance_owed)}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {summary.balance_owed <= 0
                                    ? 'You are all settled. Thank you!'
                                    : hasOverdue
                                        ? `${fmtPeso(summary.overdue_amount)} is overdue. Stores are suspended ${summary.suspend_after} day(s) after the due date.`
                                        : `Next payment due ${summary.next_due_date}.`}
                            </p>
                        </div>
                        {summary.balance_owed > 0 && (
                            <p className="text-sm text-muted-foreground">Use <strong>Pay Now</strong> on an unpaid invoice below.</p>
                        )}
                    </CardContent>
                </Card>

                {/* Commission recorded but not billed yet — nothing to pay until an invoice is issued */}
                {summary.uninvoiced > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            <strong>{fmtPeso(summary.uninvoiced)}</strong> in commission from your recent orders has not been invoiced yet, so there is nothing to pay for it right now.
                            The platform bills commission {summary.billing_period === 'weekly' ? 'every week' : 'every month'}; once your invoice is issued you will be notified and it will appear below with a <strong>Pay Now</strong> button.
                        </p>
                    </div>
                )}

                {summary.suspended && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Your store is suspended due to unpaid commission — your products are hidden from customers until your overdue invoices are paid.
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">This Month's Commission</CardTitle>
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmtPeso(summary.this_month)}</div>
                            <p className="text-xs text-muted-foreground mt-1">On orders completed this month</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{fmtPeso(summary.total_paid)}</div>
                            <p className="text-xs text-muted-foreground mt-1">All time</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Not Yet Invoiced</CardTitle>
                            <Info className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmtPeso(summary.uninvoiced)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Will appear on your next invoice</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex gap-1 border-b">
                            {TABS.map((t) => (
                                <button key={t.key} onClick={() => router.get('/seller/commission', { tab: t.key }, { preserveState: true, preserveScroll: true })}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                                    {t.label}
                                    {counts[t.key] > 0 && (
                                        <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-xs font-semibold ${t.key === 'unpaid' ? 'bg-amber-100 text-amber-800' : 'bg-muted'}`}>
                                            {counts[t.key]}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {invoices.data.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">No commission invoices yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-3 pr-4 font-medium">Invoice #</th>
                                            <th className="pb-3 pr-4 font-medium">Period</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Orders</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Sales</th>
                                            <th className="pb-3 pr-4 font-medium text-right">Commission</th>
                                            <th className="pb-3 pr-4 font-medium">Status</th>
                                            <th className="pb-3 pr-4 font-medium">Due Date</th>
                                            <th className="pb-3 font-medium text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {invoices.data.map((i) => {
                                            const unpaid = i.status === 'pending' || i.status === 'overdue';
                                            return (
                                                <tr key={i.id} className={i.status === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                                                    <td className="py-3 pr-4">
                                                        <Link href={`/seller/commission/${i.id}`} className="font-mono text-blue-600 hover:underline">{i.invoice_number}</Link>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{i.period_label}</td>
                                                    <td className="py-3 pr-4 text-right">{i.total_orders}</td>
                                                    <td className="py-3 pr-4 text-right">{fmtPeso(i.total_sales)}</td>
                                                    <td className="py-3 pr-4 text-right font-semibold">{fmtPeso(i.commission_amount)}</td>
                                                    <td className="py-3 pr-4"><InvoiceStatusBadge invoice={i} /></td>
                                                    <td className={`py-3 pr-4 whitespace-nowrap ${i.status === 'overdue' ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{i.due_date}</td>
                                                    <td className="py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <a href={`/seller/commission/${i.id}/pdf`} target="_blank" rel="noopener noreferrer"
                                                                className="inline-flex h-7 items-center rounded-md border border-input px-2 text-xs hover:bg-accent" title="Download PDF">
                                                                <FileDown className="h-3.5 w-3.5" />
                                                            </a>
                                                            {unpaid && (
                                                                <PayCommissionButton invoiceId={i.id}
                                                                    className={`h-7 text-xs text-white ${i.status === 'overdue' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`} />
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

                        {invoices.last_page > 1 && (
                            <div className="flex justify-center gap-1 pt-4">
                                {Array.from({ length: invoices.last_page }, (_, n) => n + 1).map((p) => (
                                    <Link key={p} href={`/seller/commission?tab=${tab}&page=${p}`} preserveState
                                        className={`px-3 py-1 rounded border text-sm ${p === invoices.current_page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                                        {p}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
