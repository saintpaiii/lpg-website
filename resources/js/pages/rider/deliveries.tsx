import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Camera,
    CheckCircle,
    ChevronDown,
    MapPin,
    Package,
    Phone,
    Truck,
    X,
} from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';

type OrderItem = {
    id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    product: { id: number; name: string; brand: string | null } | null;
};

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
    transaction_type: string;
    payment_method: string;
    payment_status: string;
    customer: CustomerRef | null;
    items: OrderItem[];
};

type DeliveryRow = {
    id: number;
    status: DeliveryStatus;
    notes: string | null;
    assigned_at: string | null;
    delivered_at: string | null;
    order: OrderRef | null;
};

type Counts = {
    assigned: number;
    picked_up: number;
    in_transit: number;
    delivered_today: number;
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
    tab: string;
    counts: Counts;
    filters: { tab?: string };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Deliveries', href: '/rider/deliveries' }];

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

// Next statuses a rider can move to
const STATUS_NEXT: Record<DeliveryStatus, DeliveryStatus[]> = {
    assigned:   ['picked_up', 'failed'],
    picked_up:  ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered:  [],
    failed:     [],
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    bank_transfer: 'Bank Transfer',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
    paid:    'bg-emerald-100 text-emerald-700',
    unpaid:  'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
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

// ── Update Status Dialog ───────────────────────────────────────────────────────

const PROOF_STATUSES: DeliveryStatus[] = ['picked_up', 'delivered', 'failed'];

function UpdateStatusDialog({
    delivery,
    targetStatus,
    onClose,
}: {
    delivery: DeliveryRow | null;
    targetStatus: DeliveryStatus | null;
    onClose: () => void;
}) {
    const { data, setData, post, processing, errors, reset, transform } = useForm<{
        status: string;
        notes: string;
        location_note: string;
        photo: File | null;
    }>({
        status: targetStatus ?? '',
        notes: '',
        location_note: '',
        photo: null,
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    if (data.status !== (targetStatus ?? '')) {
        setData('status', targetStatus ?? '');
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setData('photo', file);
        if (file) {
            const url = URL.createObjectURL(file);
            setPreview(url);
        } else {
            setPreview(null);
        }
    }

    function clearPhoto() {
        setData('photo', null);
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!delivery) return;
        transform((d) => ({ ...d, _method: 'PATCH' }));
        post(`/rider/deliveries/${delivery.id}/status`, {
            forceFormData: true,
            onSuccess: () => {
                reset();
                setPreview(null);
                onClose();
            },
        });
    }

    function handleClose() {
        reset();
        setPreview(null);
        onClose();
    }

    const isFailed    = targetStatus === 'failed';
    const needsPhoto  = targetStatus !== null && PROOF_STATUSES.includes(targetStatus);

    return (
        <Dialog open={!!delivery && !!targetStatus} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className={`flex items-center gap-2 ${isFailed ? 'text-red-600' : ''}`}>
                        {isFailed
                            ? <AlertTriangle className="h-4 w-4" />
                            : <CheckCircle className="h-4 w-4 text-blue-600" />
                        }
                        {isFailed ? 'Mark as Failed' : `Mark as ${targetStatus ? STATUS_LABELS[targetStatus] : ''}`}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4">
                    <p className="text-sm text-gray-600">
                        {isFailed
                            ? <>Provide a reason for the failed delivery of <span className="font-semibold">{delivery?.order?.order_number}</span>.</>
                            : <>Confirm status update for <span className="font-semibold">{delivery?.order?.order_number}</span>?</>
                        }
                    </p>

                    {/* Photo proof — hidden for in_transit */}
                    {targetStatus !== 'in_transit' && (
                        <div className="grid gap-1.5">
                            <Label className="flex items-center gap-1">
                                <Camera className="h-3.5 w-3.5" />
                                Photo Proof{needsPhoto ? ' *' : ' (optional)'}
                            </Label>
                            {preview ? (
                                <div className="relative">
                                    <img src={preview} alt="Preview" className="w-full rounded-md object-cover max-h-48 border" />
                                    <button
                                        type="button"
                                        onClick={clearPhoto}
                                        className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 p-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                                    <Camera className="h-6 w-6" />
                                    <span>Tap to take or upload a photo</span>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/jpg"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                            )}
                            {errors.photo && <p className="text-xs text-red-500">{errors.photo}</p>}
                        </div>
                    )}

                    {/* Notes */}
                    <div className="grid gap-1.5">
                        <Label>{isFailed ? 'Reason *' : 'Notes (optional)'}</Label>
                        <textarea
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                            placeholder={isFailed ? 'e.g. Customer not home, wrong address…' : 'Any delivery notes…'}
                            rows={2}
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {errors.notes && <p className="text-xs text-red-500">{errors.notes}</p>}
                    </div>

                    {/* Location note */}
                    <div className="grid gap-1.5">
                        <Label className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            Location Note (optional)
                        </Label>
                        <input
                            type="text"
                            value={data.location_note}
                            onChange={(e) => setData('location_note', e.target.value)}
                            placeholder="e.g. In front of gate, left with guard…"
                            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {errors.location_note && <p className="text-xs text-red-500">{errors.location_note}</p>}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            disabled={processing || (isFailed && !data.notes.trim()) || (needsPhoto && !data.photo)}
                            variant={isFailed ? 'destructive' : 'default'}
                            className={isFailed ? '' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                        >
                            {processing ? 'Uploading…' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Delivery Detail Panel ──────────────────────────────────────────────────────

function DeliveryDetailPanel({ delivery }: { delivery: DeliveryRow }) {
    const o = delivery.order;
    if (!o) return null;

    return (
        <div className="mt-3 grid gap-3 rounded-lg border bg-gray-50 p-3 text-sm">
            {/* Customer */}
            {o.customer && (
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Deliver to</p>
                    <p className="font-semibold text-gray-900">{o.customer.name}</p>
                    {o.customer.phone && (
                        <p className="flex items-center gap-1 text-gray-500 mt-0.5">
                            <Phone className="h-3 w-3" /> {o.customer.phone}
                        </p>
                    )}
                    <p className="flex items-start gap-1 text-gray-500 mt-0.5">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        {[o.customer.address, o.customer.barangay, o.customer.city].filter(Boolean).join(', ') || '—'}
                    </p>
                </div>
            )}

            {/* Items */}
            <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Items</p>
                <ul className="space-y-1">
                    {o.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between">
                            <span className="text-gray-700">
                                {item.product?.name ?? 'Unknown'} × {item.quantity}
                            </span>
                            <span className="tabular-nums text-gray-500">
                                ₱{item.subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="mt-2 flex justify-between border-t pt-1.5 font-semibold text-gray-900">
                    <span>Total</span>
                    <span>₱{o.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            {/* Payment info */}
            <div className="flex items-center justify-between">
                <span className="text-gray-500">
                    {PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STATUS_STYLES[o.payment_status] ?? ''}`}>
                    {o.payment_status.charAt(0).toUpperCase() + o.payment_status.slice(1)}
                </span>
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RiderDeliveries({ deliveries, tab, counts, filters }: Props) {
    const flash = (usePage().props as any).flash as { success?: string; error?: string } | undefined;

    const [expanded, setExpanded]           = useState<number | null>(null);
    const [statusTarget, setStatusTarget]   = useState<DeliveryRow | null>(null);
    const [targetStatus, setTargetStatus]   = useState<DeliveryStatus | null>(null);

    const isHistory = tab === 'history';

    function switchTab(newTab: string) {
        router.get('/rider/deliveries', { tab: newTab }, { preserveState: false });
    }

    function openStatusDialog(delivery: DeliveryRow, next: DeliveryStatus) {
        setStatusTarget(delivery);
        setTargetStatus(next);
    }

    function closeStatusDialog() {
        setStatusTarget(null);
        setTargetStatus(null);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Deliveries" />

            <div className="flex flex-col gap-6 p-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Deliveries</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">View and update your assigned deliveries.</p>
                </div>

                {/* Flash */}
                {flash?.success && (
                    <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700 border border-emerald-200">
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                        {flash.error}
                    </div>
                )}

                {/* Summary cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Assigned</CardTitle>
                            <Truck className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.assigned}</div>
                            <p className="text-xs text-muted-foreground">Pending pickup</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Picked Up</CardTitle>
                            <Package className="h-4 w-4 text-indigo-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.picked_up}</div>
                            <p className="text-xs text-muted-foreground">With rider</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
                            <Truck className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.in_transit}</div>
                            <p className="text-xs text-muted-foreground">On the way</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Delivered Today</CardTitle>
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.delivered_today}</div>
                            <p className="text-xs text-muted-foreground">Completed</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-6">
                        <button
                            onClick={() => switchTab('active')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                !isHistory
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => switchTab('history')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                isHistory
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            History
                        </button>
                    </nav>
                </div>

                {/* Deliveries list */}
                {deliveries.data.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-gray-400">
                            <Truck className="mb-3 h-10 w-10" />
                            <p className="font-medium">
                                {isHistory ? 'No delivery history yet' : 'No active deliveries'}
                            </p>
                            <p className="mt-1 text-sm">
                                {isHistory
                                    ? 'Completed and failed deliveries will appear here.'
                                    : 'New deliveries assigned to you will appear here.'
                                }
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {deliveries.data.map((d) => (
                            <Card key={d.id} className="overflow-hidden">
                                <div
                                    className="flex cursor-pointer items-start gap-3 p-4 hover:bg-gray-50/60"
                                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                                >
                                    {/* Status icon */}
                                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                        d.status === 'delivered' ? 'bg-emerald-100' :
                                        d.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                                    }`}>
                                        {d.status === 'delivered' ? (
                                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                                        ) : d.status === 'failed' ? (
                                            <AlertTriangle className="h-4 w-4 text-red-600" />
                                        ) : (
                                            <Truck className="h-4 w-4 text-blue-600" />
                                        )}
                                    </div>

                                    {/* Main info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-sm font-semibold text-blue-600">
                                                {d.order?.order_number ?? '—'}
                                            </span>
                                            <StatusBadge status={d.status} />
                                        </div>
                                        <p className="mt-0.5 font-medium text-gray-900">
                                            {d.order?.customer?.name ?? '—'}
                                        </p>
                                        {d.order?.customer && (
                                            <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                                <MapPin className="h-3 w-3" />
                                                {[
                                                    d.order.customer.address,
                                                    d.order.customer.barangay,
                                                    d.order.customer.city,
                                                ].filter(Boolean).join(', ') || '—'}
                                            </p>
                                        )}
                                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                                            <span>Assigned: {d.assigned_at ?? '—'}</span>
                                            {d.delivered_at && (
                                                <span className="text-emerald-600">Delivered: {fmtDate(d.delivered_at)}</span>
                                            )}
                                        </div>
                                        {d.notes && d.status === 'failed' && (
                                            <p className="mt-1 flex items-start gap-1 text-xs text-red-500">
                                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                {d.notes}
                                            </p>
                                        )}
                                    </div>

                                    {/* Amount + actions */}
                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                        <span className="font-semibold tabular-nums text-gray-900">
                                            ₱{(d.order?.total_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </span>

                                        {/* Status actions */}
                                        {!isHistory && STATUS_NEXT[d.status].length > 0 && (
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs">
                                                            Update Status
                                                            <ChevronDown className="ml-1 h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
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
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded detail */}
                                {expanded === d.id && <DeliveryDetailPanel delivery={d} />}
                            </Card>
                        ))}
                    </div>
                )}

                <Pagination
                    data={deliveries}
                    onVisit={(url) => router.visit(url, { preserveState: true })}
                />
            </div>

            <UpdateStatusDialog
                delivery={statusTarget}
                targetStatus={targetStatus}
                onClose={closeStatusDialog}
            />
        </AppLayout>
    );
}
