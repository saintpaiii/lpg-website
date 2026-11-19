import { statusLabel, useLiveReload } from '@/lib/echo';
import { SeenNote, SeenPill, seenRowClass, useSeenRows, type SeenFlags } from '@/components/seen-marker';
import type { SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import axios from 'axios';
import { CreditCard, Loader2, Package, Printer, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { fmtDate } from '@/lib/utils';
import CustomerLayout from '@/layouts/customer-layout';
import { ReasonPicker } from '@/components/reason-picker';
import { orderStatusLabel } from '@/lib/order-status';

type Order = {
    id: number;
    seen?: SeenFlags;
    order_number: string;
    store_name: string;
    status: string;
    fulfillment?: string;
    total_amount: number;
    /** What the customer pays: items + delivery fee (shown instead of total_amount) */
    grand_total: number;
    payment_method: string;
    payment_status: string;
    payment_mode: 'full' | 'consignment' | 'cod' | 'half';
    remaining_balance: number | null;
    balance_due_date: string | null;
    is_overdue: boolean;
    created_at: string;
    items_count: number;
    items_summary: string;
    invoice_id: number | null;
    cancelled_by: 'customer' | 'seller' | null;
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
    date_from: string;
    date_to: string;
    status: string;
    since?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
    pending:          'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    confirmed:        'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    preparing:        'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    out_for_delivery: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    delivered:        'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    cancelled:        'bg-muted text-muted-foreground border-border',
};

const PAY_STYLES: Record<string, string> = {
    unpaid:    'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    paid:      'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    to_refund: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    refunded:  'bg-muted text-muted-foreground',
    partial: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
};

/** Online order (Full Payment / Consignment) whose PayMongo payment was never completed. */
const awaitingPayment = (o: { status: string; payment_status: string; payment_mode: string }) =>
    o.payment_mode !== 'cod' && o.payment_status === 'unpaid' && ['pending', 'confirmed'].includes(o.status);

const CANCELLED_PAYMENT_MSG = 'Payment was not completed. Your order is saved — you can pay anytime within 60 minutes from My Orders, or it will be cancelled automatically.';

const STATUS_TABS = [
    { value: '',                 label: 'All' },
    { value: 'pending',          label: 'Pending' },
    { value: 'confirmed',        label: 'Confirmed' },
    { value: 'preparing',        label: 'Preparing' },
    { value: 'out_for_delivery', label: 'Out for Delivery / Ready' },
    { value: 'delivered',        label: 'Delivered' },
    { value: 'cancelled',        label: 'Cancelled' },
] as const;

export default function Orders({ orders, date_from, date_to, status }: Props) {
    // Orders the store changed since the last visit (until the customer leaves the page)
    const seen = useSeenRows(orders.data);
    // Live: any of my orders changing refreshes the list
    const meId = usePage<SharedData>().props.auth.user.id as number;
    useLiveReload(`user.${meId}`, ['orders'], () => true, (e, kind) => {
        if (kind === 'order' && 'order_number' in e && e.order_number) toast.info(`Order ${e.order_number}: ${statusLabel(e.status, (e as { fulfillment?: string }).fulfillment)}`);
    });
    const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelNotes, setCancelNotes] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [payingBalanceId, setPayingBalanceId] = useState<number | null>(null);
    const [payingId, setPayingId] = useState<number | null>(null);
    const [dateFrom, setDateFrom] = useState(date_from);
    const [dateTo,   setDateTo]   = useState(date_to);

    // Show toast when returning from PayMongo (checkout success_url points here)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const val = params.get('payment');
        const placed = params.get('placed');
        if (val === 'success') {
            toast.success('Payment received! Your orders have been updated.');
        } else if (val === 'cancelled') {
            toast.warning(CANCELLED_PAYMENT_MSG, { duration: 10000 });
        } else if (placed) {
            toast.success(placed === 'cod'
                ? 'Order placed! Please prepare cash for the rider on delivery.'
                : 'Order placed!');
        }
        if (val || placed) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
            url.searchParams.delete('placed');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    function openCancel(order: Order) {
        setCancelOrder(order);
        setCancelReason('');
        setCancelNotes('');
    }

    function closeCancel() {
        setCancelOrder(null);
        setCancelReason('');
        setCancelNotes('');
    }

    function applyDates() {
        router.get('/customer/orders', { date_from: dateFrom, date_to: dateTo, status }, { preserveState: true, replace: true });
    }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/customer/orders', { date_from: '', date_to: '', status }, { preserveState: true, replace: true });
    }

    function applyStatus(s: string) {
        router.get('/customer/orders', { date_from: dateFrom, date_to: dateTo, status: s }, { preserveState: false, replace: true });
    }

    async function payBalance(order: Order) {
        setPayingBalanceId(order.id);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(
                `/customer/orders/${order.id}/pay-balance`,
            );
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                toast.error(res.data.error ?? 'Could not start payment.');
                setPayingBalanceId(null);
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.error ?? 'Could not start balance payment.');
            setPayingBalanceId(null);
        }
    }

    async function payNow(order: Order) {
        setPayingId(order.id);
        try {
            const res = await axios.post<{ checkout_url?: string; error?: string }>(`/customer/orders/${order.id}/pay`);
            if (res.data.checkout_url) {
                window.location.href = res.data.checkout_url;
                return;
            }
            toast.error(res.data.error ?? 'Could not start payment.');
        } catch (err: any) {
            toast.error(err?.response?.data?.error ?? (err?.response ? 'Could not start payment.' : "We couldn't reach the server. Please check your internet connection and try again."));
        }
        setPayingId(null);
    }

    function submitCancel() {
        if (!cancelOrder || !cancelReason || !cancelNotes.trim()) return;
        setCancelling(true);
        router.post(`/customer/orders/${cancelOrder.id}/cancel`, {
            cancellation_reason: cancelReason,
            cancellation_notes:  cancelNotes,
        }, {
            preserveScroll: true,
            onSuccess: () => { closeCancel(); },
            onError: () => toast.error('Failed to cancel order. Please try again.'),
            onFinish: () => setCancelling(false),
        });
    }

    return (
        <CustomerLayout title="My Orders">
            <Head title="My Orders — LPG Portal" />

            <div className="space-y-4">
                {/* Status tabs */}
                <div className="overflow-x-auto -mx-1">
                    <div className="flex gap-1 min-w-max px-1 pb-1">
                        {STATUS_TABS.map(tab => (
                            <button
                                key={tab.value}
                                onClick={() => applyStatus(tab.value)}
                                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                    status === tab.value
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        {orders.total} order{orders.total !== 1 ? 's' : ''} total
                    </p>
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
                        <Link href="/customer/products">
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Browse Products</Button>
                        </Link>
                    </div>
                </div>

                <SeenNote counts={seen.counts} onClear={seen.clear} />

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Package className="h-4 w-4 text-blue-600" />
                            Order History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {orders.data.length === 0 ? (
                            <div className="py-16 text-center text-muted-foreground">
                                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                <p className="font-medium">No orders yet</p>
                                <p className="text-sm mt-1">Place your first order to get started.</p>
                                <Link href="/customer/products" className="mt-4 inline-block">
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Browse Products</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="rt-cards w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3">Order #</th>
                                            <th className="px-4 py-3">Store</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Payment</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {orders.data.map((order, i) => (
                                            <tr key={order.id} className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${seenRowClass(seen.get(order.id)) || (i % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-800/20' : '')}`}>
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/customer/orders/${order.id}`}
                                                        className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                    >
                                                        {order.order_number}
                                                    </Link>
                                                    <SeenPill flags={seen.get(order.id)} className="ml-1.5" />
                                                </td>
                                                <td className="px-4 py-3 text-xs text-foreground/80 font-medium">{order.store_name}</td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(order.created_at)}</td>
                                                <td className="px-4 py-3">
                                                    <p className="text-xs text-muted-foreground">{order.items_count} item{order.items_count !== 1 ? 's' : ''}</p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[160px]">{order.items_summary}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                                                    ₱{order.grand_total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? 'bg-muted text-muted-foreground'}`}>
                                                        {orderStatusLabel(order.status, order.fulfillment)}
                                                    </span>
                                                    {order.status === 'cancelled' && order.cancelled_by && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            by {order.cancelled_by === 'customer' ? 'you' : 'seller'}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {awaitingPayment(order) ? (
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                                                            Waiting for payment
                                                        </span>
                                                    ) : (
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? 'bg-muted text-muted-foreground'}`}>
                                                        {order.payment_status === 'to_refund' ? 'To Refund' :
                                                         order.payment_status === 'refunded'  ? 'Refunded' :
                                                         order.payment_status === 'partial'   ? 'Partial' :
                                                         order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                                                    </span>
                                                    )}
                                                    {order.payment_mode === 'half' && order.payment_status === 'partial' && order.remaining_balance !== null && (
                                                        <p className="mt-0.5 text-xs font-medium text-amber-600">Half paid · ₱{order.remaining_balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })} left</p>
                                                    )}
                                                    {order.payment_mode === 'consignment' && order.payment_status === 'partial' && order.remaining_balance !== null && (
                                                        <p className={`text-xs font-medium mt-0.5 ${order.is_overdue ? 'text-red-600' : 'text-amber-600'}`}>
                                                            Balance: ₱{order.remaining_balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                            {order.balance_due_date && ` · due ${order.balance_due_date}`}
                                                            {order.is_overdue && ' · OVERDUE'}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link href={`/customer/orders/${order.id}`}>
                                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                                                View
                                                            </Button>
                                                        </Link>
                                                        {awaitingPayment(order) && (
                                                            <Button
                                                                size="sm"
                                                                className="h-7 px-2.5 text-xs bg-amber-600 hover:bg-amber-600 text-white font-semibold gap-1"
                                                                onClick={() => payNow(order)}
                                                                disabled={payingId === order.id}
                                                            >
                                                                {payingId === order.id
                                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                    : <CreditCard className="h-3 w-3" />}
                                                                Pay now
                                                            </Button>
                                                        )}
                                                        {order.payment_status === 'partial' && (order.payment_mode === 'consignment'
                                                            || (order.payment_mode === 'half' && !['delivered', 'cancelled'].includes(order.status))) && (
                                                            <Button
                                                                size="sm"
                                                                className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                                                onClick={() => payBalance(order)}
                                                                disabled={payingBalanceId === order.id}
                                                            >
                                                                {payingBalanceId === order.id
                                                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                    : <CreditCard className="h-3 w-3" />}
                                                                Pay Balance
                                                            </Button>
                                                        )}
                                                        {order.invoice_id && order.status === 'delivered' && order.payment_status === 'paid' && (
                                                            <a
                                                                href={`/invoices/${order.invoice_id}/print`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Print Receipt">
                                                                    <Printer className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </a>
                                                        )}
                                                        {['pending', 'confirmed'].includes(order.status) && order.payment_status !== 'paid' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                                                                onClick={() => openCancel(order)}
                                                            >
                                                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                                                Cancel
                                                            </Button>
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
                                <p className="text-sm text-muted-foreground">
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

            {/* Cancel Order Dialog */}
            <Dialog open={!!cancelOrder} onOpenChange={(open) => !open && closeCancel()}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Cancel Order
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                        <p className="text-sm text-muted-foreground">
                            Cancel order <strong className="font-mono">{cancelOrder?.order_number}</strong>?
                            {cancelOrder?.status === 'confirmed' && ' Stock will be restored to the seller.'}
                        </p>
                        <ReasonPicker
                            context="customer_cancel"
                            reasonLabel="Reason"
                            reason={cancelReason}
                            notes={cancelNotes}
                            onChange={(next) => { setCancelReason(next.reason); setCancelNotes(next.notes); }}
                            rows={3}
                        />
                        {cancelOrder?.payment_status === 'paid' && (
                            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                                Your order was paid. A refund will be processed by the seller.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeCancel} disabled={cancelling}>
                            Keep Order
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={submitCancel}
                            disabled={cancelling || !cancelReason || !cancelNotes.trim()}
                        >
                            {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CustomerLayout>
    );
}
