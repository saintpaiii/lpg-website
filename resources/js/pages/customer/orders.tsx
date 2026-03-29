import { Head, Link, router } from '@inertiajs/react';
import { Package, Printer, XCircle } from 'lucide-react';
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

const CANCEL_REASONS = [
    'Changed my mind',
    'Found a better price',
    'Ordered by mistake',
    'Delivery takes too long',
    'Want to change order details',
    'Other',
];

type Order = {
    id: number;
    order_number: string;
    store_name: string;
    status: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
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
    unpaid:    'bg-red-100 text-red-700',
    paid:      'bg-emerald-100 text-emerald-700',
    to_refund: 'bg-orange-100 text-orange-700',
    refunded:  'bg-gray-100 text-gray-600',
    partial: 'bg-amber-100 text-amber-700',
};

const STATUS_TABS = [
    { value: '',                 label: 'All' },
    { value: 'pending',          label: 'Pending' },
    { value: 'confirmed',        label: 'Confirmed' },
    { value: 'preparing',        label: 'Preparing' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered',        label: 'Delivered' },
    { value: 'cancelled',        label: 'Cancelled' },
] as const;

export default function Orders({ orders, date_from, date_to, status }: Props) {
    const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelNotes, setCancelNotes] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [dateFrom, setDateFrom] = useState(date_from);
    const [dateTo,   setDateTo]   = useState(date_to);

    // Show toast when returning from PayMongo (checkout success_url points here)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const val = params.get('payment');
        if (val === 'success') {
            toast.success('Payment received! Your orders have been updated.');
        } else if (val === 'cancelled') {
            toast.error('Payment was cancelled.');
        }
        if (val) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
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

    function submitCancel() {
        if (!cancelOrder || !cancelReason) return;
        setCancelling(true);
        router.post(`/customer/orders/${cancelOrder.id}/cancel`, {
            cancellation_reason: cancelReason,
            cancellation_notes:  cancelNotes,
        }, {
            preserveScroll: true,
            onSuccess: () => { closeCancel(); toast.success('Order cancelled successfully.'); },
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
                    <p className="text-sm text-gray-500">
                        {orders.total} order{orders.total !== 1 ? 's' : ''} total
                    </p>
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
                        <Link href="/customer/products">
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Browse Products</Button>
                        </Link>
                    </div>
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
                                            <tr key={order.id} className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/10 ${i % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/customer/orders/${order.id}`}
                                                        className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                    >
                                                        {order.order_number}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-700 font-medium">{order.store_name}</td>
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
                                                        {order.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                    </span>
                                                    {order.status === 'cancelled' && order.cancelled_by && (
                                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                                            by {order.cancelled_by === 'customer' ? 'you' : 'seller'}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[order.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                        {order.payment_status === 'to_refund' ? 'To Refund' : order.payment_status === 'refunded' ? 'Refunded' : order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link href={`/customer/orders/${order.id}`}>
                                                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                                                                View
                                                            </Button>
                                                        </Link>
                                                        {order.invoice_id && order.status === 'delivered' && order.payment_status === 'paid' && (
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
                                                        {['pending', 'confirmed'].includes(order.status) && order.payment_status !== 'paid' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
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
                        <p className="text-sm text-gray-600">
                            Cancel order <strong className="font-mono">{cancelOrder?.order_number}</strong>?
                            {cancelOrder?.status === 'confirmed' && ' Stock will be restored to the seller.'}
                        </p>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Reason <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a reason…</option>
                                {CANCEL_REASONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium">
                                Additional notes <span className="text-gray-400 text-xs">(optional)</span>
                            </label>
                            <textarea
                                value={cancelNotes}
                                onChange={(e) => setCancelNotes(e.target.value)}
                                rows={3}
                                placeholder="Any additional details…"
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                        </div>
                        {cancelOrder?.payment_status === 'paid' && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
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
                            disabled={cancelling || !cancelReason}
                        >
                            {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CustomerLayout>
    );
}
