import { Head, router, useForm } from '@inertiajs/react';
import React, { useState } from 'react';
import {
    ArchiveRestore,
    ChevronDown,
    Filter,
    Printer,
    ShoppingCart,
    Store,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
type PaymentStatus = 'unpaid' | 'paid' | 'partial';
type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer' | 'maya' | 'card' | 'grab_pay' | 'credits' | 'credits_partial';
type TransactionType = 'refill' | 'new_purchase';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string | null } | null;
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
    customer: { id: number; name: string; phone: string | null } | null;
    items: OrderItem[];
    created_by: { name: string } | null;
    order_source: 'admin' | 'online';
    has_invoice: boolean;
    invoice_number: string | null;
    invoice_id: number | null;
    store_name: string | null;
    store_id: number | null;
    commission_amount: number | null;
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
    tab: 'active' | 'archived';
    archivedCount: number;
    filters: {
        status?: string;
        payment_status?: string;
        transaction_type?: string;
        search?: string;
        date_from?: string;
        date_to?: string;
    };
    userRole: 'admin' | 'rider';
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Orders', href: '/admin/orders' }];

const STATUS_LABELS: Record<OrderStatus, string> = {
    pending:          'Pending',
    confirmed:        'Confirmed',
    preparing:        'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
    pending:          'bg-yellow-100 text-yellow-700',
    confirmed:        'bg-blue-100 text-blue-700',
    preparing:        'bg-purple-100 text-purple-700',
    out_for_delivery: 'bg-orange-100 text-orange-700',
    delivered:        'bg-emerald-100 text-emerald-700',
    cancelled:        'bg-gray-100 text-gray-500',
};

const STATUS_NEXT: Record<OrderStatus, OrderStatus[]> = {
    pending:          ['confirmed', 'cancelled'],
    confirmed:        ['preparing', 'cancelled'],
    preparing:        ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered', 'cancelled'],
    delivered:        [],
    cancelled:        [],
};

const PAY_STYLES: Record<PaymentStatus, string> = {
    unpaid:  'bg-red-100 text-red-700',
    paid:    'bg-emerald-100 text-emerald-700',
    partial: 'bg-amber-100 text-amber-700',
};

const PAY_LABELS: Record<PaymentMethod, string> = {
    cash:            'Cash',
    gcash:           'GCash',
    bank_transfer:   'Bank Transfer',
    maya:            'Maya',
    card:            'Card',
    grab_pay:        'GrabPay',
    credits:         'Platform Credits',
    credits_partial: 'Credits + Online',
};

// ── Small components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
        </span>
    );
}

function PayBadge({ status }: { status: PaymentStatus }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAY_STYLES[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

function Pagination({ data, onVisit }: { data: Paginated<any>; onVisit: (url: string) => void }) {
    if (data.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">
                Showing {data.from}–{data.to} of {data.total}
            </p>
            <div className="flex gap-1">
                {data.links.map((link, i) => (
                    <button
                        key={i}
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url!)}
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
    );
}

// ── Update Payment Dialog ──────────────────────────────────────────────────────

function UpdatePaymentDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
    const { data, setData, patch, processing, reset } = useForm<{
        payment_status: PaymentStatus;
        payment_method: PaymentMethod;
    }>({
        payment_status: order?.payment_status ?? 'unpaid',
        payment_method: order?.payment_method ?? 'cash',
    });

    const [lastId, setLastId] = useState<number | null>(null);
    if (order && order.id !== lastId) {
        setLastId(order.id);
        setData({ payment_status: order.payment_status, payment_method: order.payment_method });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!order) return;
        patch(`/admin/orders/${order.id}/payment`, {
            onSuccess: () => { reset(); onClose(); toast.success('Payment updated.'); },
        });
    }

    return (
        <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Update Payment — {order?.order_number}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Payment Status</label>
                        <Select value={data.payment_status} onValueChange={(v) => setData('payment_status', v as PaymentStatus)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="partial">Partial</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Payment Method</label>
                        <Select value={data.payment_method} onValueChange={(v) => setData('payment_method', v as PaymentMethod)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="gcash">GCash</SelectItem>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="maya">Maya</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? 'Saving…' : 'Update'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Archive / Restore / Force Delete Dialogs ──────────────────────────────────

function ArchiveDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();
    return (
        <AlertDialog open={!!order} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Archive Order</AlertDialogTitle>
                    <AlertDialogDescription>
                        Archive <strong>{order?.order_number}</strong>? It will be hidden from the active list but can be restored later.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => order && destroy(`/admin/orders/${order.id}`, { onSuccess: () => { onClose(); toast.success('Order archived.'); } })}
                        disabled={processing}
                    >
                        {processing ? 'Archiving…' : 'Archive'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function RestoreDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
    const { post, processing } = useForm();
    return (
        <AlertDialog open={!!order} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Restore Order</AlertDialogTitle>
                    <AlertDialogDescription>
                        Restore <strong>{order?.order_number}</strong> back to the active list?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => order && post(`/admin/orders/${order.id}/restore`, { onSuccess: () => { onClose(); toast.success('Order restored.'); } })}
                        disabled={processing}
                    >
                        {processing ? 'Restoring…' : 'Restore'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ForceDeleteDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();
    return (
        <AlertDialog open={!!order} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Permanently Delete</AlertDialogTitle>
                    <AlertDialogDescription>
                        Permanently delete <strong>{order?.order_number}</strong>? This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => order && destroy(`/admin/orders/${order.id}/force`, { onSuccess: () => { onClose(); toast.success('Order deleted.'); } })}
                        disabled={processing}
                    >
                        {processing ? 'Deleting…' : 'Delete Forever'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrdersPage({ orders, tab, archivedCount, filters, userRole }: Props) {
    const isAdmin = userRole === 'admin';

    const [search, setSearch]       = useState(filters.search ?? '');
    const [status, setStatus]       = useState(filters.status ?? '');
    const [payStatus, setPayStatus] = useState(filters.payment_status ?? '');
    const [txType, setTxType]       = useState(filters.transaction_type ?? '');
    const [dateFrom, setDateFrom]   = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]       = useState(filters.date_to ?? '');

    const [payOrder, setPayOrder]         = useState<Order | null>(null);
    const [archiveOrder, setArchiveOrder] = useState<Order | null>(null);
    const [restoreOrder, setRestoreOrder] = useState<Order | null>(null);
    const [forceOrder, setForceOrder]     = useState<Order | null>(null);

    function switchTab(newTab: string) {
        router.get('/admin/orders', { tab: newTab }, { preserveState: false });
    }

    function applyFilters() {
        router.get(
            '/admin/orders',
            {
                tab,
                search:           search || undefined,
                status:           status || undefined,
                payment_status:   payStatus || undefined,
                transaction_type: txType || undefined,
                date_from:        dateFrom || undefined,
                date_to:          dateTo || undefined,
            },
            { preserveState: true, replace: true },
        );
    }

    function clearFilters() {
        setSearch(''); setStatus(''); setPayStatus(''); setTxType(''); setDateFrom(''); setDateTo('');
        router.get('/admin/orders', { tab }, { preserveState: false });
    }

    function handleStatusChange(order: Order, newStatus: OrderStatus) {
        router.patch(
            `/admin/orders/${order.id}/status`,
            { status: newStatus },
            { preserveScroll: true, onSuccess: () => toast.success('Order status updated.') },
        );
    }

    const hasFilters = search || status || payStatus || txType || dateFrom || dateTo;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Orders" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
                        <p className="mt-0.5 text-sm text-gray-500">Marketplace-wide order overview across all stores.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
                    <button
                        onClick={() => switchTab('active')}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => switchTab('archived')}
                        className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                            tab === 'archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Archived
                        {archivedCount > 0 && (
                            <span className="rounded-full bg-gray-300 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                                {archivedCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <Input
                                placeholder="Order # or customer…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                className="xl:col-span-2"
                            />
                            <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="preparing">Preparing</SelectItem>
                                    <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                    <SelectItem value="delivered">Delivered</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={payStatus || 'all'} onValueChange={(v) => setPayStatus(v === 'all' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="Payment" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All payments</SelectItem>
                                    <SelectItem value="unpaid">Unpaid</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="partial">Partial</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={txType || 'all'} onValueChange={(v) => setTxType(v === 'all' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    <SelectItem value="refill">Refill</SelectItem>
                                    <SelectItem value="new_purchase">New Purchase</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex gap-2">
                                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1" />
                                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1" />
                            </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                            {hasFilters && (
                                <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">Clear</Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShoppingCart className="h-4 w-4 text-blue-600" />
                            {tab === 'archived' ? 'Archived Orders' : 'Orders'}
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {orders.total} order{orders.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {orders.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <ShoppingCart className="mb-3 h-10 w-10" />
                                <p className="font-medium">No orders found</p>
                                <p className="mt-1 text-sm">
                                    {tab === 'archived' ? 'No archived orders.' : 'No orders found. Try adjusting your filters.'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Order #</th>
                                            <th className="px-4 py-3">Store</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Items</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                            <th className="px-4 py-3 text-right hidden lg:table-cell">Commission</th>
                                            <th className="px-4 py-3">Payment</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {orders.data.map((order) => (
                                            <tr key={order.id} className={`hover:bg-gray-50/60 ${order.deleted_at ? 'opacity-75' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <button
                                                            onClick={() => router.visit(`/admin/orders/${order.id}`)}
                                                            className="font-mono text-blue-600 hover:underline text-xs font-semibold"
                                                        >
                                                            {order.order_number}
                                                        </button>
                                                        {order.order_source === 'online' ? (
                                                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-semibold">Online</span>
                                                        ) : (
                                                            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px] font-semibold">Admin</span>
                                                        )}
                                                    </div>
                                                    {order.invoice_number && (
                                                        <p className="text-[10px] text-gray-400 mt-0.5">{order.invoice_number}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {order.store_name ? (
                                                        <div className="flex items-center gap-1 text-xs">
                                                            <Store className="h-3 w-3 text-gray-400 shrink-0" />
                                                            <span className="font-medium text-gray-800">{order.store_name}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900">{order.customer?.name ?? '—'}</p>
                                                    {order.customer?.phone && (
                                                        <p className="text-xs text-gray-400">{order.customer.phone}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {order.transaction_type === 'refill' ? 'Refill' : 'New Purchase'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    ₱{order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right text-xs text-amber-700 tabular-nums hidden lg:table-cell">
                                                    {order.commission_amount != null
                                                        ? '₱' + order.commission_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-0.5">
                                                        <PayBadge status={order.payment_status} />
                                                        <span className="text-[10px] text-gray-400">{PAY_LABELS[order.payment_method]}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isAdmin && tab === 'active' && STATUS_NEXT[order.status].length > 0 ? (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                                                    <StatusBadge status={order.status} />
                                                                    <ChevronDown className="h-3 w-3 text-gray-400" />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="start" className="w-48">
                                                                <p className="px-2 py-1.5 text-xs text-gray-500 font-medium">Move to</p>
                                                                <DropdownMenuSeparator />
                                                                {STATUS_NEXT[order.status].map((s) => (
                                                                    <DropdownMenuItem
                                                                        key={s}
                                                                        onClick={() => handleStatusChange(order, s)}
                                                                        className={s === 'cancelled' ? 'text-red-600' : ''}
                                                                    >
                                                                        {STATUS_LABELS[s]}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    ) : (
                                                        <StatusBadge status={order.status} />
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                                                    {fmtDate(order.ordered_at ?? order.created_at)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => router.visit(`/admin/orders/${order.id}`)}
                                                            className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100"
                                                        >
                                                            View
                                                        </Button>
                                                        {order.invoice_id && (
                                                            <a
                                                                href={`/invoices/${order.invoice_id}/print`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                                                                    title="Print Receipt"
                                                                >
                                                                    <Printer className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </a>
                                                        )}

                                                        {isAdmin && tab === 'active' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setPayOrder(order)}
                                                                    className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-50"
                                                                >
                                                                    Payment
                                                                </Button>
                                                                {['cancelled', 'delivered'].includes(order.status) && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => setArchiveOrder(order)}
                                                                        className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-50"
                                                                        title="Archive"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}

                                                        {isAdmin && tab === 'archived' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setRestoreOrder(order)}
                                                                    className="h-7 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                                                                >
                                                                    <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                                                                    Restore
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setForceOrder(order)}
                                                                    className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                                                                    title="Permanently delete"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Pagination
                            data={orders}
                            onVisit={(url) => router.visit(url, { preserveState: true })}
                        />
                    </CardContent>
                </Card>
            </div>

            <UpdatePaymentDialog order={payOrder} onClose={() => setPayOrder(null)} />
            <ArchiveDialog order={archiveOrder} onClose={() => setArchiveOrder(null)} />
            <RestoreDialog order={restoreOrder} onClose={() => setRestoreOrder(null)} />
            <ForceDeleteDialog order={forceOrder} onClose={() => setForceOrder(null)} />
        </AppLayout>
    );
}
