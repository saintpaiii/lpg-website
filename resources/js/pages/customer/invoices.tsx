import { Head, Link, router } from '@inertiajs/react';
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
    unpaid:    'bg-red-100 text-red-700 border-red-200',
    paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
    partial:   'bg-amber-100 text-amber-700 border-amber-200',
    to_refund: 'bg-orange-100 text-orange-700 border-orange-200',
    refunded:  'bg-gray-100 text-gray-600 border-gray-200',
};

export default function Invoices({ invoices, date_from, date_to }: Props) {
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
                    <label className="text-xs text-gray-500 font-medium">From</label>
                    <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 font-medium">To</label>
                    <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <Button size="sm" variant="outline" onClick={applyDates}>Apply</Button>
                {(dateFrom || dateTo) && <Button size="sm" variant="ghost" className="text-gray-500" onClick={clearDates}>Clear</Button>}
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Receipt className="h-4 w-4 text-blue-600" />
                        Invoice History
                        <span className="ml-auto text-sm font-normal text-gray-400">
                            {invoices.total} invoice{invoices.total !== 1 ? 's' : ''}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {invoices.data.length === 0 ? (
                        <div className="py-16 text-center text-gray-400">
                            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No invoices yet</p>
                            <p className="text-sm mt-1">Invoices are generated when an order is confirmed.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3">Invoice #</th>
                                        <th className="px-4 py-3">Order #</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3 text-right">Total</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Due</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {invoices.data.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/customer/invoices/${inv.id}`}
                                                    className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                >
                                                    {inv.invoice_number}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono text-gray-500">
                                                {inv.order_number ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(inv.created_at)}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                ₱{inv.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[inv.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                    {inv.payment_status === 'to_refund' ? 'To Refund' : inv.payment_status === 'refunded' ? 'Refunded' : inv.payment_status.charAt(0).toUpperCase() + inv.payment_status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
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
                                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" title="Print Receipt">
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
                            <p className="text-sm text-gray-500">
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
                                                ? 'hover:bg-gray-100 text-gray-600'
                                                : 'text-gray-300 pointer-events-none'
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
