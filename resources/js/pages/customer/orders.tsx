import { Head, Link } from '@inertiajs/react';
import { Package, Printer } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type Order = {
    id: number;
    order_number: string;
    status: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    created_at: string;
    items_count: number;
    items_summary: string;
    invoice_id: number | null;
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
    orders: Paginated<Order>;
};

const STATUS_STYLES: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-700 border-yellow-200',
    confirmed:        'bg-blue-100 text-blue-700 border-blue-200',
    preparing:        'bg-purple-100 text-purple-700 border-purple-200',
    out_for_delivery: 'bg-orange-100 text-orange-700 border-orange-200',
    delivered:        'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled:        'bg-gray-100 text-gray-500 border-gray-200',
};

const PAY_STYLES: Record<string, string> = {
    unpaid:  'bg-red-100 text-red-700',
    paid:    'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
};

export default function Orders({ orders }: Props) {
    return (
        <CustomerLayout title="My Orders">
            <Head title="My Orders — LPG Portal" />

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        {orders.total} order{orders.total !== 1 ? 's' : ''} total
                    </p>
                    <Link href="/customer/products">
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                            Browse Products
                        </Button>
                    </Link>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4 text-blue-600" />
                            Order History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {orders.data.length === 0 ? (
                            <div className="py-16 text-center text-gray-400">
                                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                <p className="font-medium">No orders yet</p>
                                <p className="text-sm mt-1">Place your first order to get started.</p>
                                <Link href="/customer/products" className="mt-4 inline-block">
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Browse Products</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Order #</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Payment</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {orders.data.map((order) => (
                                            <tr key={order.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/customer/orders/${order.id}`}
                                                        className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                    >
                                                        {order.order_number}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(order.created_at)}</td>
                                                <td className="px-4 py-3">
                                                    <p className="text-xs text-gray-600">{order.items_count} item{order.items_count !== 1 ? 's' : ''}</p>
                                                    <p className="text-xs text-gray-400 truncate max-w-[160px]">{order.items_summary}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                                                    ₱{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                        {order.status.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? ''}`}>
                                                        {order.payment_status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link href={`/customer/orders/${order.id}`}>
                                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                                                View
                                                            </Button>
                                                        </Link>
                                                        {order.invoice_id && ['confirmed', 'preparing', 'out_for_delivery', 'delivered'].includes(order.status) && (
                                                            <a
                                                                href={`/invoices/${order.invoice_id}/print`}
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

                        {/* Pagination */}
                        {orders.last_page > 1 && (
                            <div className="flex items-center justify-between border-t px-4 py-3">
                                <p className="text-sm text-gray-500">
                                    Showing {orders.from}–{orders.to} of {orders.total}
                                </p>
                                <div className="flex gap-1">
                                    {orders.links.map((link, i) => (
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
