import { Head, Link, router } from '@inertiajs/react';
import { SeenNote, SeenPill, seenRowClass, useSeenRows } from '@/components/seen-marker';
import { Receipt, Printer } from 'lucide-react';
import { useState } from 'react';
import { fmtDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import CustomerLayout from '@/layouts/customer-layout';

type Invoice = {
    id: number;
    invoice_number: string;
    total_amount: number;
    /** What the customer pays: items + delivery fee (shown instead of total_amount) */
    grand_total: number;
    payment_status: string;
    paid_amount: number;
    payment_method: string | null;
    due_date: string | null;
    paid_at: string | null;
    created_at: string;
    order_number: string | null;
    order_status: string | null;
};

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    invoices: Paginated<Invoice>;
    date_from: string;
    date_to: string;
};

const PAY_STYLES: Record<string, string> = {
    unpaid:    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    paid:      'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    partial:   'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    to_refund: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    refunded:  'bg-muted text-muted-foreground border-border',
};

export default function Invoices({ invoices, date_from, date_to }: Props) {
    // New / updated since the last visit (until the user leaves the page)
    const seen = useSeenRows(invoices.data);
    const [dateFrom, setDateFrom] = useState(date_from);
    const [dateTo,   setDateTo]   = useState(date_to);

    function applyDates() {
        router.get('/customer/invoices', { date_from: dateFrom, date_to: dateTo }, { preserveState: true, replace: true });
    }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/customer/invoices', { date_from: '', date_to: '' }, { preserveState: true, replace: true });
    }

    return (
        <CustomerLayout title="My Invoices">
            <Head title="My Invoices — LPG Portal" />

            <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">From</label>
                    <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">To</label>
                    <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={applyDates}>Apply</Button>
                {(dateFrom || dateTo) && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={clearDates}>Clear</Button>}
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Receipt className="h-4 w-4 text-blue-600" />
                        Invoice History
                        <span className="ml-auto text-sm font-normal text-muted-foreground">
                            {invoices.total} invoice{invoices.total !== 1 ? 's' : ''}
                        </span>
                    </CardTitle>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        An invoice is made when the store confirms your order. If you paid before that, your payment receipt is on the order&apos;s page (My Orders → View).
                    </p>
                </CardHeader>
                <CardContent className="p-0">
                    {invoices.data.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No invoices yet</p>
                            <p className="text-sm mt-1">Invoices are generated when an order is confirmed.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <SeenNote counts={seen.counts} onClear={seen.clear} />

                            <table className="rt-cards w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        <th className="px-4 py-3">Invoice #</th>
                                        <th className="px-4 py-3">Order #</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3 text-right">Total</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Due</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {invoices.data.map((inv) => (
                                        <tr key={inv.id} className={`hover:bg-muted/60 ${seenRowClass(seen.get(inv.id))}`}>
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/customer/invoices/${inv.id}`}
                                                    className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                >
                                                    {inv.invoice_number}
                                                </Link>
                                                <SeenPill flags={seen.get(inv.id)} className="ml-1.5" />
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                                                {inv.order_number ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(inv.created_at)}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                ₱{inv.grand_total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[inv.payment_status] ?? 'bg-muted text-muted-foreground'}`}>
                                                    {inv.payment_status === 'to_refund' ? 'To Refund' : inv.payment_status === 'refunded' ? 'Refunded' : inv.payment_status.charAt(0).toUpperCase() + inv.payment_status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                                {inv.due_date ?? '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Link href={`/customer/invoices/${inv.id}`}>
                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">View</Button>
                                                    </Link>
                                                    {inv.order_status === 'delivered' && inv.payment_status === 'paid' && (
                                                        <a
                                                            href={`/invoices/${inv.id}/print`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Print Receipt">
                                                                <Printer className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {invoices.last_page > 1 && (
                        <div className="flex items-center justify-between border-t px-4 py-3">
                            <p className="text-sm text-muted-foreground">
                                Showing {invoices.from}–{invoices.to} of {invoices.total}
                            </p>
                            <div className="flex gap-1">
                                {invoices.links.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url ?? '#'}
                                        className={`min-w-[32px] rounded px-2 py-1 text-sm text-center ${
                                            link.active
                                                ? 'bg-blue-600 text-white'
                                                : link.url
                                                ? 'hover:bg-muted text-muted-foreground'
                                                : 'text-muted-foreground pointer-events-none'
                                        }`}
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            </div>
        </CustomerLayout>
    );
}
