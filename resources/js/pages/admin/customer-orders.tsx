import { Head, router } from '@inertiajs/react';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { fmtDate, fmtMoney } from '@/lib/utils';
import * as customerRoutes from '@/routes/admin/customers';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Customer = {
    id: number;
    name: string;
    phone: string | null;
    city: string | null;
    barangay: string | null;
    customer_type: 'residential' | 'commercial' | 'industrial';
};

type OrderItem = {
    id: number;
    product: { name: string } | null;
    quantity: number;
    unit_price: number;
};

type Order = {
    id: number;
    order_number: string;
    status: string;
    payment_status: string;
    total_amount: number;
    created_at: string;
    items: OrderItem[];
};

type PaginatedOrders = {
    data: Order[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
};

type Props = {
    customer: Customer;
    orders: PaginatedOrders;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) => fmtMoney(n);

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    preparing: 'bg-purple-100 text-purple-700',
    out_for_delivery: 'bg-orange-100 text-orange-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
};

const PAYMENT_COLORS: Record<string, string> = {
    unpaid: 'bg-red-100 text-red-700',
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    refunded: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ value, colors }: { value: string; colors: Record<string, string> }) {
    const cls = colors[value] ?? 'bg-gray-100 text-gray-600';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
            {value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CustomerOrdersPage({ customer, orders }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Customers', href: '/admin/customers' },
        { title: customer.name, href: customerRoutes.orders(customer.id).url },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${customer.name} — Order History`} />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.visit('/admin/customers')}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            {customer.barangay}{customer.city ? `, ${customer.city}` : ''} ·{' '}
                            {customer.phone ?? 'No phone'} ·{' '}
                            <span className="capitalize">{customer.customer_type}</span>
                        </p>
                    </div>
                </div>

                {/* Orders table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShoppingCart className="h-4 w-4 text-blue-600" />
                            Order History
                            <span className="ml-auto text-sm font-normal text-gray-500">
                                {orders.total} order{orders.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {orders.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ShoppingCart className="mb-3 h-10 w-10" />
                                <p className="font-medium">No orders yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Order #</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3">Total</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Payment</th>
                                            <th className="px-4 py-3">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {orders.data.map((o) => (
                                            <tr key={o.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3 font-mono font-medium text-blue-600">
                                                    {o.order_number}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {o.items.map((item) => (
                                                        <div key={item.id} className="text-xs">
                                                            {item.product?.name ?? '—'} × {item.quantity}
                                                        </div>
                                                    ))}
                                                </td>
                                                <td className="px-4 py-3 font-medium">{fmt(o.total_amount)}</td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge value={o.status} colors={STATUS_COLORS} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge value={o.payment_status} colors={PAYMENT_COLORS} />
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{fmtDate(o.created_at)}</td>
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
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.visit(link.url)}
                                            className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                                                link.active
                                                    ? 'bg-blue-600 text-white'
                                                    : link.url
                                                    ? 'hover:bg-gray-100 text-gray-600'
                                                    : 'text-gray-300 cursor-not-allowed'
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
        </AppLayout>
    );
}
