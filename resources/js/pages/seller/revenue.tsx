import AppLayout from '@/layouts/app-layout';
import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, Info, Percent, TrendingUp, Wallet } from 'lucide-react';

interface Summary {
    total_revenue: number;
    month_revenue: number;
    commission_paid: number;
    commission_due: number;
    net_revenue: number;
    commission_rate: number;
}

interface CommissionRow {
    id: number;
    order_id: number;
    order_number: string | null;
    payment_mode: 'full' | 'consignment' | 'cod' | null;
    order_total: number;
    commission_rate: number;
    commission_amount: number;
    seller_amount: number;
    status: 'pending' | 'invoiced' | 'collected' | 'failed' | 'waived';
    collected_at: string | null;
    created_at: string;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

interface Props {
    summary: Summary;
    commissions: Paginated<CommissionRow>;
    filters: { date_from?: string; date_to?: string; status?: string };
}

const fmt = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

const STATUS_STYLES: Record<CommissionRow['status'], string> = {
    pending:   'bg-gray-100 text-gray-700',
    invoiced:  'bg-yellow-100 text-yellow-800',
    collected: 'bg-green-100 text-green-800',
    failed:    'bg-red-100 text-red-700',
    waived:    'bg-blue-100 text-blue-700',
};

const STATUS_LABELS: Record<CommissionRow['status'], string> = {
    pending:   'Not yet invoiced',
    invoiced:  'Invoiced',
    collected: 'Paid',
    failed:    'Failed',
    waived:    'Waived',
};

const MODE_LABELS: Record<string, string> = {
    full:        'Full Payment',
    consignment: 'Consignment',
    cod:         'COD',
};

export default function SellerRevenue({ summary, commissions, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo,   setDateTo]   = useState(filters.date_to ?? '');
    const [status,   setStatus]   = useState(filters.status ?? '');

    function visit(params: Record<string, string | number>) {
        router.get('/seller/revenue', { date_from: dateFrom, date_to: dateTo, status, ...params }, { preserveScroll: true, preserveState: true });
    }

    function clearFilters() {
        setDateFrom(''); setDateTo(''); setStatus('');
        router.get('/seller/revenue', {}, { preserveScroll: true, preserveState: true });
    }

    const exportQs = `date_from=${dateFrom}&date_to=${dateTo}&status=${status}`;

    return (
        <AppLayout>
            <Head title="Revenue" />

            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">Revenue</h1>
                        <p className="text-sm text-muted-foreground">Sales from delivered and fully paid orders, and the platform commission on each.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a href={`/seller/revenue/export?format=csv&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> CSV
                        </a>
                        <a href={`/seller/revenue/export?format=pdf&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            <FileDown className="h-4 w-4" /> PDF
                        </a>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(summary.total_revenue)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Gross sales, all time</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue This Month</CardTitle>
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{fmt(summary.month_revenue)}</div>
                            <p className="text-xs text-muted-foreground mt-1">Gross sales since the 1st</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Commission Paid</CardTitle>
                            <Percent className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">{fmt(summary.commission_paid)}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {summary.commission_due > 0 ? `${fmt(summary.commission_due)} still due` : 'Nothing outstanding'}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Net Revenue</CardTitle>
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">{fmt(summary.net_revenue)}</div>
                            <p className="text-xs text-muted-foreground mt-1">After {summary.commission_rate}% platform commission</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                        The platform does not hold seller balances. A {summary.commission_rate}% commission is recorded for each
                        delivered and fully paid order and billed to you periodically — see <a href="/seller/commission" className="font-semibold underline">Commission</a> to pay your invoices.
                    </p>
                </div>

                {/* Commission history */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle>Commission History</CardTitle>
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Status</label>
                                    <select value={status} onChange={(e) => setStatus(e.target.value)}
                                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                        <option value="">All</option>
                                        <option value="pending">Not yet invoiced</option>
                                        <option value="invoiced">Invoiced</option>
                                        <option value="collected">Paid</option>
                                        <option value="waived">Waived</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">From</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">To</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => visit({})}>Apply</Button>
                                {(dateFrom || dateTo || status) && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {commissions.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No completed sales yet. Commission records appear once an order is delivered and fully paid.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Date</th>
                                                <th className="pb-3 pr-4 font-medium">Order</th>
                                                <th className="pb-3 pr-4 font-medium">Payment</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Order Total</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Commission</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Net</th>
                                                <th className="pb-3 font-medium">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {commissions.data.map((c) => (
                                                <tr key={c.id}>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{c.created_at}</td>
                                                    <td className="py-3 pr-4">
                                                        <a href={`/seller/orders/${c.order_id}`} className="font-mono text-blue-600 hover:underline">
                                                            {c.order_number ?? '—'}
                                                        </a>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground">{c.payment_mode ? MODE_LABELS[c.payment_mode] : '—'}</td>
                                                    <td className="py-3 pr-4 text-right">{fmt(c.order_total)}</td>
                                                    <td className="py-3 pr-4 text-right text-orange-600">
                                                        −{fmt(c.commission_amount)}
                                                        <span className="ml-1 text-xs text-muted-foreground">({c.commission_rate}%)</span>
                                                    </td>
                                                    <td className="py-3 pr-4 text-right font-medium text-green-600">{fmt(c.seller_amount)}</td>
                                                    <td className="py-3">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                                                            {STATUS_LABELS[c.status]}
                                                        </span>
                                                        {c.collected_at && <p className="text-xs text-muted-foreground mt-0.5">{c.collected_at}</p>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {commissions.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {commissions.from}–{commissions.to} of {commissions.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={commissions.current_page === 1}
                                                onClick={() => visit({ page: commissions.current_page - 1 })}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{commissions.current_page} / {commissions.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={commissions.current_page === commissions.last_page}
                                                onClick={() => visit({ page: commissions.current_page + 1 })}>
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
