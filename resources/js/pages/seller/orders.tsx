import { Head, Link, router } from '@inertiajs/react';
import { CheckCircle, Loader2, Search, ShoppingCart, Truck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Orders',    href: '/seller/orders'    },
];

type Order = {
    id: number;
    order_number: string;
    status: string;
    transaction_type: string;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    customer: { id: number; name: string } | null;
    created_at: string;
};

type Rider  = { id: number; name: string };
type Counts = { pending: number; confirmed: number; preparing: number; out_for_delivery: number };
type Paginated = { data: Order[]; current_page: number; last_page: number; total: number };

type Props = {
    orders:  Paginated;
    counts:  Counts;
    tab:     string;
    filters: { status?: string; search?: string };
    riders:  Rider[];
};

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:        'bg-green-100 text-green-800',
    cancelled:        'bg-red-100 text-red-800',
};

const PAY_COLORS: Record<string, string> = {
    paid:    'bg-green-100 text-green-700',
    unpaid:  'bg-red-100 text-red-700',
    partial: 'bg-yellow-100 text-yellow-700',
};

type ActionDialog =
    | { type: 'confirm';       order: Order }
    | { type: 'prepare';       order: Order }
    | { type: 'cancel';        order: Order }
    | { type: 'assign_rider';  order: Order }
    | null;

export default function SellerOrders({ orders, counts, tab, filters, riders }: Props) {
    const [searchVal, setSearchVal] = useState(filters.search ?? '');
    const [dialog,    setDialog]    = useState<ActionDialog>(null);
    const [riderId,   setRiderId]   = useState('');
    const [loading,   setLoading]   = useState(false);

    function goTab(t: string) {
        router.get('/seller/orders', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        router.get('/seller/orders', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    function openDialog(d: ActionDialog) {
        setRiderId('');
        setDialog(d);
    }

    function patchStatus(orderId: number, status: string, onDone?: () => void) {
        setLoading(true);
        router.patch(`/seller/orders/${orderId}/status`, { status }, {
            preserveScroll: true,
            onSuccess: () => { setDialog(null); onDone?.(); },
            onError: (errs) => {
                const msg = Object.values(errs)[0] ?? 'Action failed.';
                toast.error(String(msg));
            },
            onFinish: () => setLoading(false),
        });
    }

    function handleConfirm() {
        if (!dialog || dialog.type !== 'confirm') return;
        patchStatus(dialog.order.id, 'confirmed');
    }

    function handlePrepare() {
        if (!dialog || dialog.type !== 'prepare') return;
        patchStatus(dialog.order.id, 'preparing');
    }

    function handleCancel() {
        if (!dialog || dialog.type !== 'cancel') return;
        patchStatus(dialog.order.id, 'cancelled');
    }

    function handleAssignRider() {
        if (!dialog || dialog.type !== 'assign_rider' || !riderId) return;
        setLoading(true);
        router.post(`/seller/orders/${dialog.order.id}/assign-delivery`, { rider_id: riderId }, {
            preserveScroll: true,
            onSuccess: () => setDialog(null),
            onError: (errs) => {
                const msg = Object.values(errs)[0] ?? 'Failed to assign rider.';
                toast.error(String(msg));
            },
            onFinish: () => setLoading(false),
        });
    }

    const TABS = [
        { key: 'active',   label: 'Active'   },
        { key: 'archived', label: 'Archived' },
    ];

    const ACTIVE_STATUS_COUNTS = [
        { label: 'Pending',          value: counts.pending,          color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
        { label: 'Confirmed',        value: counts.confirmed,        color: 'text-blue-700 bg-blue-50 border-blue-200'       },
        { label: 'Preparing',        value: counts.preparing,        color: 'text-purple-700 bg-purple-50 border-purple-200' },
        { label: 'Out for Delivery', value: counts.out_for_delivery, color: 'text-orange-700 bg-orange-50 border-orange-200' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Orders" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <ShoppingCart className="h-6 w-6 text-blue-600" />
                            Orders
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">Manage your store's orders.</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <form onSubmit={doSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Order # or customer…" className="pl-9 w-52" value={searchVal}
                                    onChange={(e) => setSearchVal(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">Search</Button>
                        </form>
                    </div>
                </div>

                {/* Status summary (active tab only) */}
                {tab === 'active' && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {ACTIVE_STATUS_COUNTS.map(({ label, value, color }) => (
                            <div key={label} className={`rounded-lg border px-4 py-3 ${color}`}>
                                <p className="text-xs font-medium">{label}</p>
                                <p className="text-2xl font-bold mt-0.5">{value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label }) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Order</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Customer</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Payment</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
                                        {tab === 'active' && (
                                            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.data.length === 0 ? (
                                        <tr><td colSpan={tab === 'active' ? 7 : 6} className="text-center py-12 text-muted-foreground">No orders found.</td></tr>
                                    ) : orders.data.map((o) => (
                                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <Link href={`/seller/orders/${o.id}`} className="font-mono text-xs text-blue-600 hover:underline font-medium">
                                                    {o.order_number}
                                                </Link>
                                                <p className="text-xs text-muted-foreground capitalize">{o.transaction_type.replace('_', ' ')}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">{o.customer?.name ?? '—'}</td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                ₱{o.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                                    {o.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center hidden md:table-cell">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAY_COLORS[o.payment_status] ?? 'bg-gray-100 text-gray-700'}`}>
                                                    {o.payment_status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                {fmtDate(o.created_at)}
                                            </td>
                                            {tab === 'active' && (
                                                <td className="px-4 py-3 text-center">
                                                    <OrderActions order={o} riders={riders} onOpen={openDialog} />
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {orders.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{orders.total} orders</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: orders.last_page }, (_, i) => i + 1).map((pg) => (
                                        <button key={pg}
                                            onClick={() => router.get('/seller/orders', { tab, search: searchVal, page: pg })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${pg === orders.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {pg}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Confirm Dialog ── */}
            <AlertDialog open={dialog?.type === 'confirm'} onOpenChange={(open) => !open && setDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Confirm <strong>{dialog?.type === 'confirm' ? dialog.order.order_number : ''}</strong>?
                            Stock will be deducted and an invoice will be generated.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirm} disabled={loading}
                            className="bg-green-600 hover:bg-green-700">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                            Confirm Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Prepare Dialog ── */}
            <AlertDialog open={dialog?.type === 'prepare'} onOpenChange={(open) => !open && setDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Mark as Preparing</AlertDialogTitle>
                        <AlertDialogDescription>
                            Mark <strong>{dialog?.type === 'prepare' ? dialog.order.order_number : ''}</strong> as preparing?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handlePrepare} disabled={loading}
                            className="bg-purple-600 hover:bg-purple-700">
                            {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                            Mark Preparing
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Cancel Dialog ── */}
            <AlertDialog open={dialog?.type === 'cancel'} onOpenChange={(open) => !open && setDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cancel <strong>{dialog?.type === 'cancel' ? dialog.order.order_number : ''}</strong>?
                            {dialog?.type === 'cancel' && !['pending'].includes(dialog.order.status) &&
                                ' Stock will be restored.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Keep Order</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel} disabled={loading}
                            className="bg-red-600 hover:bg-red-700">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                            Cancel Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Assign Rider Dialog ── */}
            <AlertDialog open={dialog?.type === 'assign_rider'} onOpenChange={(open) => !open && setDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Assign Rider</AlertDialogTitle>
                        <AlertDialogDescription>
                            Assign a rider for <strong>{dialog?.type === 'assign_rider' ? dialog.order.order_number : ''}</strong>.
                            The order will move to Out for Delivery.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="px-1 pb-2">
                        {riders.length === 0 ? (
                            <p className="text-sm text-amber-600">No riders available. Add rider staff to your store first.</p>
                        ) : (
                            <Select value={riderId} onValueChange={setRiderId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a rider…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {riders.map((r) => (
                                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAssignRider} disabled={loading || !riderId || riders.length === 0}
                            className="bg-orange-600 hover:bg-orange-700">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Truck className="h-4 w-4 mr-1" />}
                            Assign Rider
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}

function OrderActions({
    order, riders, onOpen,
}: {
    order:  Order;
    riders: Rider[];
    onOpen: (d: ActionDialog) => void;
}) {
    const isFinal = ['delivered', 'cancelled'].includes(order.status);
    if (isFinal) return <span className="text-xs text-muted-foreground">—</span>;

    return (
        <div className="flex items-center justify-center gap-1 flex-wrap">
            {order.status === 'pending' && (
                <Button size="sm" variant="outline"
                    className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => onOpen({ type: 'confirm', order })}>
                    Confirm
                </Button>
            )}
            {order.status === 'confirmed' && (
                <Button size="sm" variant="outline"
                    className="h-7 px-2 text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
                    onClick={() => onOpen({ type: 'prepare', order })}>
                    Prepare
                </Button>
            )}
            {order.status === 'preparing' && (
                <Button size="sm" variant="outline"
                    className="h-7 px-2 text-xs text-orange-700 border-orange-300 hover:bg-orange-50"
                    onClick={() => onOpen({ type: 'assign_rider', order })}>
                    <Truck className="h-3 w-3 mr-1" />
                    Assign
                </Button>
            )}
            {!isFinal && order.status !== 'out_for_delivery' && (
                <Button size="sm" variant="outline"
                    className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => onOpen({ type: 'cancel', order })}>
                    Cancel
                </Button>
            )}
        </div>
    );
}
