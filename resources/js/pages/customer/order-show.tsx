import { Head, Link, router } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Circle, Clock, CreditCard, ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CustomerLayout from '@/layouts/customer-layout';

type Payment = {
    id: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled';
    paymongo_checkout_id: string;
    paymongo_payment_id: string | null;
    payment_method: string | null;
    paid_at: string | null;
};

type Order = {
    id: number;
    order_number: string;
    status: string;
    transaction_type: string;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    notes: string | null;
    ordered_at: string | null;
    delivered_at: string | null;
    created_at: string;
    items: {
        id: number;
        quantity: number;
        unit_price: number;
        subtotal: number;
        product: { name: string; brand: string | null } | null;
    }[];
    delivery: {
        status: string;
        rider_name: string | null;
        assigned_at: string | null;
    } | null;
    invoice: {
        id: number;
        invoice_number: string;
        payment_status: string;
        paid_amount: number;
        due_date: string | null;
    } | null;
    payment: Payment | null;
};

type Props = { order: Order };

const ORDER_STEPS = [
    { key: 'pending',          label: 'Pending' },
    { key: 'confirmed',        label: 'Confirmed' },
    { key: 'preparing',        label: 'Preparing' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered',        label: 'Delivered' },
];

const STATUS_STYLES: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-indigo-100 text-indigo-800',
    out_for_delivery: 'bg-purple-100 text-purple-800',
    delivered:        'bg-emerald-100 text-emerald-800',
    cancelled:        'bg-gray-100 text-gray-600',
};

const PAY_STYLES: Record<string, string> = {
    unpaid:  'bg-red-100 text-red-700',
    paid:    'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
};

function StatusStepper({ status }: { status: string }) {
    const isCancelled = status === 'cancelled';
    const currentIdx  = ORDER_STEPS.findIndex((s) => s.key === status);

    if (isCancelled) {
        return (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
                This order has been cancelled.
            </div>
        );
    }

    return (
        <div className="flex items-center w-full overflow-x-auto pb-2">
            {ORDER_STEPS.map((step, idx) => {
                const done    = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                    <div key={step.key} className="flex items-center flex-1 last:flex-none min-w-0">
                        <div className="flex flex-col items-center shrink-0">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                                done    ? 'border-emerald-500 bg-emerald-500' :
                                current ? 'border-blue-600 bg-blue-600' :
                                          'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                            }`}>
                                {done ? (
                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                ) : current ? (
                                    <Clock className="h-4 w-4 text-white" />
                                ) : (
                                    <Circle className="h-4 w-4 text-gray-300" />
                                )}
                            </div>
                            <span className={`mt-1.5 text-xs font-medium text-center whitespace-nowrap ${
                                done || current ? 'text-gray-900 dark:text-white' : 'text-gray-400'
                            }`}>
                                {step.label}
                            </span>
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 mb-5 min-w-[20px] ${done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function OrderShow({ order }: Props) {
    const canPrint  = order.invoice && ['confirmed', 'preparing', 'out_for_delivery', 'delivered'].includes(order.status);
    const [paying, setPaying]     = useState(false);
    const [verifying, setVerifying] = useState(false);

    function getCsrfToken(): string {
        const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    // Show toast for ?payment=success|cancelled query param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const val = params.get('payment');
        if (val === 'success') {
            toast.success('Payment received! Your order has been updated.');
        } else if (val === 'cancelled') {
            toast.error('Payment was cancelled. You can retry below.');
        }
        if (val) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    // Whether to show Pay Now / Retry
    const showPayButton = order.payment_status !== 'paid' && (
        !order.payment || order.payment.status === 'pending' || order.payment.status === 'cancelled' || order.payment.status === 'failed'
    ) && order.status !== 'cancelled';

    // Only show for online payment orders (no payment_method means online)
    const isOnlineOrder = order.payment !== null || order.payment_method === null;

    function handlePayNow() {
        setPaying(true);
        fetch(`/customer/orders/${order.id}/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-XSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({}),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.checkout_url) {
                    window.location.href = data.checkout_url;
                } else {
                    toast.error(data.error ?? 'Could not start payment. Please try again.');
                    setPaying(false);
                }
            })
            .catch(() => {
                toast.error('Network error. Please try again.');
                setPaying(false);
            });
    }

    function handleVerifyPayment() {
        setVerifying(true);
        fetch(`/customer/orders/${order.id}/verify-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-XSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({}),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'paid') {
                    toast.success(data.message);
                    router.reload({ only: ['order'] });
                } else if (data.status === 'error') {
                    toast.error(data.message);
                } else {
                    toast.info(data.message);
                }
                setVerifying(false);
            })
            .catch(() => {
                toast.error('Network error. Please try again.');
                setVerifying(false);
            });
    }

    // Show verify button when there is a pending payment and order isn't cancelled/paid
    const showVerifyButton = order.payment?.status === 'pending'
        && order.payment_status !== 'paid'
        && order.status !== 'cancelled';

    return (
        <CustomerLayout>
            <Head title={`Order ${order.order_number} — LPG Portal`} />

            <div className="space-y-6">
                {/* Back + header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/customer/orders">
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <ArrowLeft className="h-4 w-4" /> Orders
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white font-mono">{order.order_number}</h1>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[order.status] ?? 'bg-gray-100'}`}>
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isOnlineOrder && showPayButton && (
                            <Button
                                size="sm"
                                onClick={handlePayNow}
                                disabled={paying || verifying}
                                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <CreditCard className="h-4 w-4" />
                                {order.payment?.status === 'cancelled' || order.payment?.status === 'failed'
                                    ? 'Retry Payment'
                                    : 'Pay Now'}
                            </Button>
                        )}
                        {showVerifyButton && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleVerifyPayment}
                                disabled={verifying || paying}
                                className="gap-1.5"
                            >
                                <RefreshCw className={`h-4 w-4 ${verifying ? 'animate-spin' : ''}`} />
                                Verify Payment
                            </Button>
                        )}
                        {canPrint && (
                            <a href={`/invoices/${order.invoice!.id}/print`} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm" className="gap-1.5">
                                    <Printer className="h-4 w-4" />
                                    Print Receipt
                                </Button>
                            </a>
                        )}
                    </div>
                </div>

                {/* Status tracker */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Delivery Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StatusStepper status={order.status} />
                        {order.delivery && (
                            <div className="mt-4 pt-4 border-t border-gray-100 grid gap-2 sm:grid-cols-2 text-sm">
                                {order.delivery.rider_name && (
                                    <div>
                                        <span className="text-gray-500">Rider:</span>{' '}
                                        <span className="font-medium">{order.delivery.rider_name}</span>
                                    </div>
                                )}
                                {order.delivery.assigned_at && (
                                    <div>
                                        <span className="text-gray-500">Assigned:</span>{' '}
                                        <span className="font-medium">{order.delivery.assigned_at}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Items */}
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Order Items</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Product</th>
                                            <th className="px-4 py-3 text-center">Qty</th>
                                            <th className="px-4 py-3 text-right">Unit Price</th>
                                            <th className="px-4 py-3 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {order.items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900 dark:text-white">{item.product?.name ?? '—'}</p>
                                                    {item.product?.brand && (
                                                        <p className="text-xs text-gray-400">{item.product.brand}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    ₱{item.unit_price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t bg-gray-50">
                                            <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-700">Total</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                                                ₱{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Details sidebar */}
                    <div className="space-y-4">
                        {/* Order info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Order Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Type</span>
                                    <span className="font-medium">{order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Ordered</span>
                                    <span className="font-medium">{order.ordered_at ?? order.created_at}</span>
                                </div>
                                {order.delivered_at && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Delivered</span>
                                        <span className="font-medium">{order.delivered_at}</span>
                                    </div>
                                )}
                                {order.notes && (
                                    <div>
                                        <span className="text-gray-500 block mb-1">Notes</span>
                                        <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">{order.notes}</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Payment info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Payment</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? ''}`}>
                                        {order.payment_status}
                                    </span>
                                </div>
                                {order.payment_method && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Method</span>
                                        <span className="font-medium capitalize">{order.payment_method.replace('_', ' ')}</span>
                                    </div>
                                )}
                                {order.payment && (
                                    <>
                                        {order.payment.status !== 'paid' && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-500">Payment</span>
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    order.payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                    order.payment.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {order.payment.status}
                                                </span>
                                            </div>
                                        )}
                                        {order.payment.paymongo_payment_id && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-gray-500 shrink-0">Ref #</span>
                                                <span className="font-mono text-xs font-medium text-right break-all">{order.payment.paymongo_payment_id}</span>
                                            </div>
                                        )}
                                        {order.payment.paid_at && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Paid At</span>
                                                <span className="font-medium text-xs">{order.payment.paid_at}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                {order.invoice && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Invoice #</span>
                                            <Link href={`/customer/invoices/${order.invoice.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline flex items-center gap-0.5">
                                                {order.invoice.invoice_number}
                                                <ExternalLink className="h-3 w-3" />
                                            </Link>
                                        </div>
                                        {order.invoice.due_date && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Due</span>
                                                <span className="font-medium">{order.invoice.due_date}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </CustomerLayout>
    );
}
