import { Head, router } from '@inertiajs/react';
import React from 'react';
import {
    CheckCircle2,
    FileText,
    MapPin,
    Phone,
    ShoppingCart,
    Truck,
    User,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type OrderStatus    = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
type PaymentStatus  = 'unpaid' | 'paid' | 'partial';
type PaymentMethod  = 'cash' | 'gcash' | 'bank_transfer' | 'maya';
type TransactionType = 'refill' | 'new_purchase';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string | null } | null;
};

type Delivery = {
    id: number;
    status: string;
    assigned_at: string | null;
    delivered_at: string | null;
    rider: { name: string; phone: string | null } | null;
};

type Order = {
    id: number;
    order_number: string;
    status: OrderStatus;
    transaction_type: TransactionType;
    total_amount: number;
    payment_method: PaymentMethod;
    payment_status: PaymentStatus;
    notes: string | null;
    ordered_at: string | null;
    delivered_at: string | null;
    created_at: string;
    deleted_at: string | null;
    customer: {
        id: number;
        name: string;
        phone: string | null;
        address: string | null;
        barangay: string | null;
        city: string | null;
    } | null;
    items: OrderItem[];
    created_by: { name: string } | null;
    has_invoice: boolean;
    invoice_number: string | null;
    delivery: Delivery | null;
    store_name: string | null;
    store_id: number | null;
};

type Props = {
    order: Order;
    [key: string]: unknown;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<OrderStatus, string> = {
    pending:          'Pending',
    confirmed:        'Confirmed',
    preparing:        'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
    pending:          'bg-yellow-100 text-yellow-700 border-yellow-200',
    confirmed:        'bg-blue-100 text-blue-700 border-blue-200',
    preparing:        'bg-purple-100 text-purple-700 border-purple-200',
    out_for_delivery: 'bg-orange-100 text-orange-700 border-orange-200',
    delivered:        'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled:        'bg-gray-100 text-gray-500 border-gray-200',
};

// All 6 statuses in order for the progress stepper (excluding cancelled)
const STATUS_STEPS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

const PAY_STYLES: Record<PaymentStatus, string> = {
    unpaid:  'bg-red-100 text-red-700',
    paid:    'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
};

const PAY_LABELS: Record<string, string> = {
    cash:          'Cash',
    gcash:         'GCash',
    bank_transfer: 'Bank Transfer',
    maya:          'Maya',
    card:          'Card',
    grab_pay:      'GrabPay',
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrderShowPage({ order }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Orders', href: '/admin/orders' },
        { title: order.order_number, href: `/admin/orders/${order.id}` },
    ];

    const isCancelled = order.status === 'cancelled';
    const currentStep = STATUS_STEPS.indexOf(order.status);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={order.order_number} />

            <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">

                {/* Header */}
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Created {order.ordered_at ?? order.created_at}
                            {order.created_by && ` by ${order.created_by.name}`}
                            {order.store_name && (
                                <span className="ml-2 font-medium text-blue-600">· {order.store_name}</span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_STYLES[order.status]}`}>
                            {STATUS_LABELS[order.status]}
                        </span>
                        {order.invoice_number && (
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 font-mono">
                                {order.invoice_number}
                            </span>
                        )}
                    </div>
                </div>

                {/* Status stepper */}
                {!isCancelled && (
                    <Card>
                        <CardContent className="pt-5 pb-4">
                            <div className="flex items-center">
                                {STATUS_STEPS.map((step, i) => {
                                    const done    = i <= currentStep;
                                    const current = i === currentStep;
                                    return (
                                        <React.Fragment key={step}>
                                            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                                                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                                                    done ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                                                } ${current ? 'ring-4 ring-blue-100' : ''}`}>
                                                    {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                                                </div>
                                                <span className={`text-center text-[10px] font-medium leading-tight ${
                                                    current ? 'text-blue-700' : done ? 'text-gray-600' : 'text-gray-400'
                                                }`}>
                                                    {STATUS_LABELS[step]}
                                                </span>
                                            </div>
                                            {i < STATUS_STEPS.length - 1 && (
                                                <div className={`h-0.5 flex-1 -mt-4 ${
                                                    i < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                                                }`} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {isCancelled && (
                    <div className="flex items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-500">
                        <XCircle className="h-4 w-4 text-gray-400" />
                        This order was cancelled.
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-3">

                    {/* Left: items + notes */}
                    <div className="lg:col-span-2 grid gap-6 content-start">

                        {/* Items */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <ShoppingCart className="h-4 w-4 text-blue-600" />
                                    Items
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-2.5">Product</th>
                                            <th className="px-4 py-2.5 text-right">Qty</th>
                                            <th className="px-4 py-2.5 text-right">Unit Price</th>
                                            <th className="px-4 py-2.5 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {order.items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-2.5">
                                                    <p className="font-medium text-gray-900">{item.product?.name ?? '—'}</p>
                                                    {item.product?.brand && (
                                                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                                                    ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                                                    ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t bg-gray-50">
                                            <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-gray-700">Total</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-blue-700 text-base">
                                                ₱{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </CardContent>
                        </Card>

                        {/* Notes */}
                        {order.notes && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Notes</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-gray-600 whitespace-pre-line">{order.notes}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right: sidebar cards */}
                    <div className="grid gap-4 content-start">

                        {/* Customer */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <User className="h-4 w-4 text-gray-500" /> Customer
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {order.customer ? (
                                    <div className="grid gap-1">
                                        <p className="font-semibold text-gray-900">{order.customer.name}</p>
                                        {order.customer.phone && (
                                            <p className="flex items-center gap-1.5 text-gray-500">
                                                <Phone className="h-3.5 w-3.5" />
                                                {order.customer.phone}
                                            </p>
                                        )}
                                        {(order.customer.address || order.customer.barangay) && (
                                            <p className="flex items-start gap-1.5 text-gray-500">
                                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                {[order.customer.address, order.customer.barangay, order.customer.city].filter(Boolean).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-gray-400">—</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Payment */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <FileText className="h-4 w-4 text-gray-500" /> Payment
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm grid gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status]}`}>
                                        {order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500">Method</span>
                                    <span className="font-medium">{PAY_LABELS[order.payment_method] ?? order.payment_method}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500">Type</span>
                                    <span className="font-medium">
                                        {order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}
                                    </span>
                                </div>
                                {order.delivered_at && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Delivered</span>
                                        <span className="text-xs text-gray-600">{fmtDate(order.delivered_at)}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Delivery */}
                        {order.delivery && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                        <Truck className="h-4 w-4 text-gray-500" /> Delivery
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm grid gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Status</span>
                                        <span className="font-medium capitalize">
                                            {order.delivery.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    {order.delivery.rider && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500">Rider</span>
                                            <div className="text-right">
                                                <p className="font-medium">{order.delivery.rider.name}</p>
                                                {order.delivery.rider.phone && (
                                                    <p className="text-xs text-gray-400">{order.delivery.rider.phone}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {order.delivery.assigned_at && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500">Assigned</span>
                                            <span className="text-xs text-gray-600">{order.delivery.assigned_at}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Back button */}
                <div>
                    <Button
                        variant="ghost"
                        onClick={() => router.visit('/admin/orders')}
                        className="text-gray-500"
                    >
                        ← Back to Orders
                    </Button>
                </div>
            </div>
        </AppLayout>
    );
}
