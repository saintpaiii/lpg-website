import { Head, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Archive,
    ChevronDown,
    Filter,
    MapPin,
    Package,
    Phone,
    Plus,
    RotateCcw,
    Trash2,
    Truck,
    User,
    Users,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { formatAddress } from '@/data/cavite-locations';

// ── Types ──────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';

type CustomerRef = {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    barangay: string | null;
    city: string | null;
};

type OrderRef = {
    id: number;
    order_number: string;
    status: string;
    total_amount: number;
    items_count: number;
    customer: CustomerRef | null;
};

type Rider = {
    id: number;
    name: string;
    phone: string | null;
};

type RiderWorkload = Rider & {
    active_deliveries_count: number;
};

type DeliveryRow = {
    id: number;
    status: DeliveryStatus;
    notes: string | null;
    assigned_at: string | null;
    delivered_at: string | null;
    deleted_at: string | null;
    rider: Rider | null;
    order: OrderRef | null;
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
    deliveries: Paginated<DeliveryRow>;
    pendingOrders: OrderRef[];
    riders: Rider[];
    riderWorkload: RiderWorkload[];
    archivedCount: number;
    tab: string;
    filters: {
        status?: string;
        rider_id?: string;
        date_from?: string;
        date_to?: string;
        tab?: string;
    };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Deliveries', href: '/admin/deliveries' }];

const STATUS_LABELS: Record<DeliveryStatus, string> = {
    assigned:   'Assigned',
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

const STATUS_STYLES: Record<DeliveryStatus, string> = {
    assigned:   'bg-blue-100 text-blue-700',
    picked_up:  'bg-indigo-100 text-indigo-700',
    in_transit: 'bg-purple-100 text-purple-700',
    delivered:  'bg-emerald-100 text-emerald-700',
    failed:     'bg-red-100 text-red-700',
};

const STATUS_NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
    assigned:   ['picked_up', 'failed'],
    picked_up:  ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered:  [],
    failed:     [],
};

// ── Small components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeliveryStatus }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
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

// ── Rider Workload Cards ───────────────────────────────────────────────────────

function RiderWorkloadCards({ riders }: { riders: RiderWorkload[] }) {
    if (riders.length === 0) return null;
    return (
        <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Users className="h-4 w-4 text-blue-500" />
                Rider Workload
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {riders.map((r) => (
                    <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
                            <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{r.name}</p>
                            {r.phone && (
                                <p className="text-xs text-gray-400">{r.phone}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <span className={`text-lg font-bold tabular-nums ${
                                r.active_deliveries_count > 0 ? 'text-blue-600' : 'text-gray-300'
                            }`}>
                                {r.active_deliveries_count}
                            </span>
                            <p className="text-xs text-gray-400">active</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Assign Delivery Dialog ─────────────────────────────────────────────────────

function AssignDeliveryDialog({
    open,
    onClose,
    pendingOrders,
    riders,
}: {
    open: boolean;
    onClose: () => void;
    pendingOrders: OrderRef[];
    riders: Rider[];
}) {
    const { data, setData, post, processing, errors, reset } = useForm<{
        order_id: string;
        rider_id: string;
        notes: string;
    }>({
        order_id: '',
        rider_id: '',
        notes: '',
    });

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        post('/admin/deliveries', {
            onSuccess: () => { reset(); onClose(); toast.success('Rider assigned.'); },
        });
    }

    function handleClose() {
        reset();
        onClose();
    }

    const selectedOrder = pendingOrders.find(o => o.id.toString() === data.order_id);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        Assign Delivery
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    {/* Order */}
                    <div className="grid gap-1.5">
                        <Label>Order <span className="text-red-500">*</span></Label>
                        {pendingOrders.length === 0 ? (
                            <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                                No orders waiting for delivery
                            </div>
                        ) : (
                            <Select
                                value={data.order_id || 'none'}
                                onValueChange={(v) => setData('order_id', v === 'none' ? '' : v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select order…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" disabled>Select order…</SelectItem>
                                    {pendingOrders.map((o) => (
                                        <SelectItem key={o.id} value={o.id.toString()}>
                                            {o.order_number} — {o.customer?.name ?? '?'} ({o.items_count} item{o.items_count !== 1 ? 's' : ''})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {errors.order_id && <p className="text-xs text-red-500">{errors.order_id}</p>}
                    </div>

                    {/* Selected order info */}
                    {selectedOrder?.customer && (
                        <div className="rounded-md bg-gray-50 p-3 text-sm">
                            <p className="font-medium text-gray-900">{selectedOrder.customer.name}</p>
                            {selectedOrder.customer.phone && (
                                <p className="flex items-center gap-1 text-gray-500 mt-0.5">
                                    <Phone className="h-3 w-3" /> {selectedOrder.customer.phone}
                                </p>
                            )}
                            {(selectedOrder.customer.address || selectedOrder.customer.barangay) && (
                                <p className="flex items-center gap-1 text-gray-500 mt-0.5">
                                    <MapPin className="h-3 w-3" />
                                    {formatAddress(selectedOrder.customer.address, selectedOrder.customer.barangay, selectedOrder.customer.city)}
                                </p>
                            )}
                            <p className="mt-1 font-semibold text-blue-700">
                                ₱{selectedOrder.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    )}

                    {/* Rider */}
                    <div className="grid gap-1.5">
                        <Label>Rider <span className="text-red-500">*</span></Label>
                        {riders.length === 0 ? (
                            <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                                No active riders available
                            </div>
                        ) : (
                            <Select
                                value={data.rider_id || 'none'}
                                onValueChange={(v) => setData('rider_id', v === 'none' ? '' : v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select rider…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" disabled>Select rider…</SelectItem>
                                    {riders.map((r) => (
                                        <SelectItem key={r.id} value={r.id.toString()}>
                                            {r.name}{r.phone ? ` — ${r.phone}` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {errors.rider_id && <p className="text-xs text-red-500">{errors.rider_id}</p>}
                    </div>

                    {/* Notes */}
                    <div className="grid gap-1.5">
                        <Label>Notes</Label>
                        <Input
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                            placeholder="Delivery instructions…"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            disabled={processing || !data.order_id || !data.rider_id || pendingOrders.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? 'Assigning…' : 'Assign Delivery'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Update Status Dialog (with notes for failed) ───────────────────────────────

function UpdateStatusDialog({
    delivery,
    targetStatus,
    onClose,
}: {
    delivery: DeliveryRow | null;
    targetStatus: DeliveryStatus | null;
    onClose: () => void;
}) {
    const { data, setData, patch, processing, errors, reset } = useForm<{
        status: string;
        notes: string;
    }>({
        status: targetStatus ?? '',
        notes: '',
    });

    // Keep form in sync when target changes
    if (data.status !== (targetStatus ?? '')) {
        setData('status', targetStatus ?? '');
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!delivery) return;
        patch(`/admin/deliveries/${delivery.id}/status`, {
            onSuccess: () => { reset(); onClose(); toast.success('Delivery status updated.'); },
        });
    }

    function handleClose() {
        reset();
        onClose();
    }

    const isFailed = targetStatus === 'failed';

    return (
        <Dialog open={!!delivery && !!targetStatus} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 ${isFailed ? 'text-red-600' : ''}`}>
                        {isFailed ? <AlertTriangle className="h-4 w-4" /> : <Truck className="h-4 w-4 text-blue-600" />}
                        {isFailed ? 'Mark as Failed' : `Mark as ${targetStatus ? STATUS_LABELS[targetStatus] : ''}`}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <p className="text-sm text-gray-600">
                        {isFailed
                            ? <>Please provide a reason for the failed delivery of <span className="font-semibold">{delivery?.order?.order_number}</span>.</>
                            : <>Move delivery for <span className="font-semibold">{delivery?.order?.order_number}</span> to <span className="font-semibold">{targetStatus ? STATUS_LABELS[targetStatus] : ''}</span>?</>
                        }
                    </p>

                    <div className="grid gap-1.5">
                        <Label>{isFailed ? <>Reason <span className="text-red-500">*</span></> : 'Notes'}</Label>
                        <textarea
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                            placeholder={isFailed ? 'e.g. Customer not home, wrong address…' : 'Optional notes…'}
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {errors.notes && <p className="text-xs text-red-500">{errors.notes}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            disabled={processing || (isFailed && !data.notes.trim())}
                            variant={isFailed ? 'destructive' : 'default'}
                            className={isFailed ? '' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                        >
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? 'Updating…' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Unassign Dialog ────────────────────────────────────────────────────────────

function UnassignDialog({ delivery, onClose }: { delivery: DeliveryRow | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();

    function handleConfirm() {
        if (!delivery) return;
        destroy(`/admin/deliveries/${delivery.id}/unassign`, {
            onSuccess: () => { onClose(); toast.success('Delivery assignment removed.'); },
        });
    }

    return (
        <AlertDialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove Assignment?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Remove delivery assignment for{' '}
                        <span className="font-semibold">{delivery?.order?.order_number}</span>?
                        The order will revert to <span className="font-semibold">Preparing</span> status.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={handleConfirm}
                        disabled={processing}
                    >
                        {processing ? 'Removing…' : 'Remove'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ── Force Delete Dialog ────────────────────────────────────────────────────────

function ForceDeleteDialog({ delivery, onClose }: { delivery: DeliveryRow | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();

    function handleConfirm() {
        if (!delivery) return;
        destroy(`/admin/deliveries/${delivery.id}/force`, {
            onSuccess: () => { onClose(); toast.success('Delivery record permanently deleted.'); },
        });
    }

    return (
        <AlertDialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Permanently delete delivery record for{' '}
                        <span className="font-semibold">{delivery?.order?.order_number}</span>?
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={handleConfirm}
                        disabled={processing}
                    >
                        {processing ? 'Deleting…' : 'Delete Permanently'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DeliveriesPage({
    deliveries,
    pendingOrders,
    riders,
    riderWorkload,
    archivedCount,
    tab,
    filters,
}: Props) {
    const [assignOpen, setAssignOpen]         = useState(false);
    const [unassignTarget, setUnassignTarget] = useState<DeliveryRow | null>(null);
    const [forceDeleteTarget, setForceDeleteTarget] = useState<DeliveryRow | null>(null);

    // Status update dialog
    const [statusTarget, setStatusTarget]   = useState<DeliveryRow | null>(null);
    const [targetStatus, setTargetStatus]   = useState<DeliveryStatus | null>(null);

    const [status, setStatus]     = useState(filters.status ?? '');
    const [riderId, setRiderId]   = useState(filters.rider_id ?? '');
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? '');
    const [dateTo, setDateTo]     = useState(filters.date_to ?? '');

    function switchTab(newTab: string) {
        router.get('/admin/deliveries', { tab: newTab }, { preserveState: false });
    }

    function applyFilters() {
        router.get(
            '/admin/deliveries',
            {
                tab,
                status:    status || undefined,
                rider_id:  riderId || undefined,
                date_from: dateFrom || undefined,
                date_to:   dateTo || undefined,
            },
            { preserveState: true, replace: true },
        );
    }

    function clearFilters() {
        setStatus(''); setRiderId(''); setDateFrom(''); setDateTo('');
        router.get('/admin/deliveries', { tab }, { preserveState: false });
    }

    function openStatusDialog(delivery: DeliveryRow, next: DeliveryStatus) {
        setStatusTarget(delivery);
        setTargetStatus(next);
    }

    function closeStatusDialog() {
        setStatusTarget(null);
        setTargetStatus(null);
    }

    function handleRestore(delivery: DeliveryRow) {
        router.post(`/admin/deliveries/${delivery.id}/restore`, {}, {
            preserveScroll: true,
            onSuccess: () => toast.success('Delivery restored.'),
        });
    }

    function handleArchive(delivery: DeliveryRow) {
        router.delete(`/admin/deliveries/${delivery.id}`, {
            preserveScroll: true,
            onSuccess: () => toast.success('Delivery archived.'),
        });
    }

    const hasFilters = status || riderId || dateFrom || dateTo;
    const isArchived = tab === 'archived';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Deliveries" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Deliveries</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Assign riders and track delivery status.
                        </p>
                    </div>
                    {!isArchived && (
                        <div className="flex items-center gap-2">
                            {pendingOrders.length > 0 && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                    {pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} waiting
                                </span>
                            )}
                            <Button
                                onClick={() => setAssignOpen(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Plus className="mr-1.5 h-4 w-4" />
                                Assign Delivery
                            </Button>
                        </div>
                    )}
                </div>


                {/* Rider Workload */}
                {!isArchived && <RiderWorkloadCards riders={riderWorkload} />}

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-6">
                        <button
                            onClick={() => switchTab('active')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                !isArchived
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => switchTab('archived')}
                            className={`flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                isArchived
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Archived
                            {archivedCount > 0 && (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                                    {archivedCount}
                                </span>
                            )}
                        </button>
                    </nav>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {!isArchived && (
                                <Select value={status || 'all'} onValueChange={(v) => setStatus(v === 'all' ? '' : v)}>
                                    <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All statuses</SelectItem>
                                        <SelectItem value="assigned">Assigned</SelectItem>
                                        <SelectItem value="picked_up">Picked Up</SelectItem>
                                        <SelectItem value="in_transit">In Transit</SelectItem>
                                        <SelectItem value="delivered">Delivered</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            <Select value={riderId || 'all'} onValueChange={(v) => setRiderId(v === 'all' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="All riders" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All riders</SelectItem>
                                    {riders.map((r) => (
                                        <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Filter className="mr-1.5 h-3.5 w-3.5" /> Apply
                            </Button>
                            {hasFilters && (
                                <Button size="sm" variant="ghost" onClick={clearFilters} className="text-gray-500">
                                    Clear
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Truck className="h-4 w-4 text-blue-600" />
                            {isArchived ? 'Archived Deliveries' : 'Deliveries'}
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {deliveries.total} record{deliveries.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {deliveries.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Truck className="mb-3 h-10 w-10" />
                                <p className="font-medium">
                                    {isArchived ? 'No archived deliveries' : 'No deliveries found'}
                                </p>
                                {!isArchived && <p className="mt-1 text-sm">Assign a rider to get started.</p>}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Order</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3">Address</th>
                                            <th className="px-4 py-3">Rider</th>
                                            <th className="px-4 py-3 text-right">Amount</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Timeline</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {deliveries.data.map((d) => (
                                            <tr key={d.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs text-blue-600">
                                                        {d.order?.order_number ?? '—'}
                                                    </span>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {d.order?.items_count ?? 0} item{(d.order?.items_count ?? 0) !== 1 ? 's' : ''}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-medium text-gray-900">{d.order?.customer?.name ?? '—'}</p>
                                                    {d.order?.customer?.phone && (
                                                        <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                                            <Phone className="h-3 w-3" />
                                                            {d.order.customer.phone}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px]">
                                                    {d.order?.customer ? (
                                                        <span className="flex items-start gap-1">
                                                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                                            {[
                                                                d.order.customer.address,
                                                                d.order.customer.barangay,
                                                                d.order.customer.city,
                                                            ].filter(Boolean).join(', ') || '—'}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {d.rider ? (
                                                        <div>
                                                            <p className="font-medium text-gray-900">{d.rider.name}</p>
                                                            {d.rider.phone && (
                                                                <p className="text-xs text-gray-400">{d.rider.phone}</p>
                                                            )}
                                                        </div>
                                                    ) : <span className="text-gray-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                                    ₱{(d.order?.total_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {!isArchived && STATUS_NEXT[d.status].length > 0 ? (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
                                                                    <StatusBadge status={d.status} />
                                                                    <ChevronDown className="h-3 w-3 text-gray-400" />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="start" className="w-44">
                                                                <p className="px-2 py-1.5 text-xs text-gray-500 font-medium">Move to</p>
                                                                <DropdownMenuSeparator />
                                                                {STATUS_NEXT[d.status].map((s) => (
                                                                    <DropdownMenuItem
                                                                        key={s}
                                                                        onClick={() => openStatusDialog(d, s)}
                                                                        className={s === 'failed' ? 'text-red-600' : ''}
                                                                    >
                                                                        {STATUS_LABELS[s]}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    ) : (
                                                        <StatusBadge status={d.status} />
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                                                    {d.assigned_at ? fmtDate(d.assigned_at) : '—'}
                                                    {d.delivered_at && (
                                                        <p className="text-emerald-600">↳ {fmtDate(d.delivered_at)}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isArchived ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleRestore(d)}
                                                                    className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                                                    title="Restore"
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setForceDeleteTarget(d)}
                                                                    className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                                                                    title="Delete permanently"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {d.status === 'assigned' && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => setUnassignTarget(d)}
                                                                        className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                                                                        title="Remove assignment"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                                {(d.status === 'delivered' || d.status === 'failed') && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => handleArchive(d)}
                                                                        className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                                                        title="Archive"
                                                                    >
                                                                        <Archive className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
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
                            data={deliveries}
                            onVisit={(url) => router.visit(url, { preserveState: true })}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Dialogs */}
            <AssignDeliveryDialog
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                pendingOrders={pendingOrders}
                riders={riders}
            />
            <UpdateStatusDialog
                delivery={statusTarget}
                targetStatus={targetStatus}
                onClose={closeStatusDialog}
            />
            <UnassignDialog
                delivery={unassignTarget}
                onClose={() => setUnassignTarget(null)}
            />
            <ForceDeleteDialog
                delivery={forceDeleteTarget}
                onClose={() => setForceDeleteTarget(null)}
            />
        </AppLayout>
    );
}
