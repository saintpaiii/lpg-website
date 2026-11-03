import AppLayout from '@/layouts/app-layout';
import { ExportLink } from '@/components/export-link';
import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, PackageCheck, Receipt, TrendingUp } from 'lucide-react';

interface Summary {
    total_sales: number;
    month_sales: number;
    orders: number;
    average_order_value: number;
}

interface SaleRow {
    id: number;
    order_number: string;
    delivered_on: string;
    payment_mode: 'full' | 'consignment' | 'cod';
    payment_method: string | null;
    subtotal: number;
    shipping_fee: number;
    total: number;
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
    orders: Paginated<SaleRow>;
    filters: { date_from?: string; date_to?: string };
}

const fmt = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

const MODE_LABELS: Record<string, string> = {
    full:        'Full Payment',
    consignment: 'Consignment',
    cod:         'COD',
};

export default function SellerRevenue({ summary, orders, filters }: Props) {
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo,   setDateTo]   = useState(filters.date_to ?? '');

    function visit(params: Record<string, string | number>) {
        router.get('/seller/revenue', { date_from: dateFrom, date_to: dateTo, ...params }, { preserveScroll: true, preserveState: true });
    }

    function clearFilters() {
        setDateFrom(''); setDateTo('');
        router.get('/seller/revenue', {}, { preserveScroll: true, preserveState: true });
    }

    const exportQs = `date_from=${dateFrom}&date_to=${dateTo}`;

    const cards = [
        { title: 'Total Sales',         value: fmt(summary.total_sales),         sub: 'Delivered & paid, all time', icon: TrendingUp },
        { title: 'Sales This Month',    value: fmt(summary.month_sales),         sub: 'Since the 1st',              icon: CalendarDays },
        { title: 'Delivered & Paid Orders', value: summary.orders.toLocaleString(), sub: 'All time',                icon: PackageCheck },
        { title: 'Average Order Value', value: fmt(summary.average_order_value), sub: 'Per delivered & paid order', icon: Receipt },
    ];

    return (
        <AppLayout>
            <Head title="Revenue" />

            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold">Revenue</h1>
                        <p className="text-sm text-muted-foreground">Sales from your delivered and fully paid orders. Your store keeps the full amount.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <ExportLink href={`/seller/revenue/export?format=csv&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            CSV
                        </ExportLink>
                        <ExportLink href={`/seller/revenue/export?format=pdf&${exportQs}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
                            PDF
                        </ExportLink>
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {cards.map(({ title, value, sub, icon: Icon }) => (
                        <Card key={title}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{value}</div>
                                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Sales */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle>Sales</CardTitle>
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">Delivered from</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-muted-foreground font-medium">To</label>
                                    <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => visit({})}>Apply</Button>
                                {(dateFrom || dateTo) && <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {orders.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No completed sales yet. Orders appear here once they are delivered and fully paid.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-3 pr-4 font-medium">Order #</th>
                                                <th className="pb-3 pr-4 font-medium">Delivered on</th>
                                                <th className="pb-3 pr-4 font-medium">Payment</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Items Subtotal</th>
                                                <th className="pb-3 pr-4 font-medium text-right">Delivery Fee</th>
                                                <th className="pb-3 font-medium text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {orders.data.map((o) => (
                                                <tr key={o.id}>
                                                    <td className="py-3 pr-4">
                                                        <Link href={`/seller/orders/${o.id}`} className="font-mono text-blue-600 hover:underline">
                                                            {o.order_number}
                                                        </Link>
                                                    </td>
                                                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{o.delivered_on}</td>
                                                    <td className="py-3 pr-4 text-muted-foreground">
                                                        {MODE_LABELS[o.payment_mode] ?? o.payment_mode}
                                                        {o.payment_method && <span className="capitalize"> · {o.payment_method.replace('_', ' ')}</span>}
                                                    </td>
                                                    <td className="py-3 pr-4 text-right">{fmt(o.subtotal)}</td>
                                                    <td className="py-3 pr-4 text-right">{fmt(o.shipping_fee)}</td>
                                                    <td className="py-3 text-right font-medium">{fmt(o.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {orders.last_page > 1 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-sm text-muted-foreground">
                                            {orders.from}–{orders.to} of {orders.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" disabled={orders.current_page === 1}
                                                onClick={() => visit({ page: orders.current_page - 1 })}>
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm px-2 py-1">{orders.current_page} / {orders.last_page}</span>
                                            <Button variant="outline" size="sm" disabled={orders.current_page === orders.last_page}
                                                onClick={() => visit({ page: orders.current_page + 1 })}>
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
