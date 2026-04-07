import { Head, router } from '@inertiajs/react';
import { Camera, ChevronDown, ChevronUp, MapPin, Search, Truck } from 'lucide-react';
import { useState } from 'react';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDateTime } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard',  href: '/seller/dashboard'  },
    { title: 'Deliveries', href: '/seller/deliveries' },
];

type DeliveryProof = {
    id: number;
    status: string;
    photo_url: string | null;
    notes: string | null;
    location_note: string | null;
    created_at: string;
};

type Delivery = {
    id: number;
    status: string;
    assigned_at: string | null;
    delivered_at: string | null;
    notes: string | null;
    order: { id: number; order_number: string; customer: string; address: string; total_amount: number } | null;
    rider: { id: number; name: string; phone: string | null } | null;
    vehicle: { id: number; vehicle_type: string; plate_number: string } | null;
    proofs: DeliveryProof[];
};

type Rider = { id: number; name: string; phone: string | null };
type Vehicle = { id: number; vehicle_type: string; plate_number: string; max_capacity_kg: number; max_tanks: number; status: string };
type Unassigned = { id: number; order_number: string; customer: string; status: string };
type Counts = { active: number; completed: number };
type Paginated = { data: Delivery[]; current_page: number; last_page: number; total: number };

const VEHICLE_TYPE_LABELS: Record<string, string> = {
    motorcycle:   'Motorcycle',
    tricycle:     'Tricycle',
    multicab:     'Multicab',
    van:          'Van',
    pickup_truck: 'Pickup Truck',
    small_truck:  'Small Truck',
    large_truck:  'Large Truck',
};

type Props = {
    deliveries: Paginated;
    riders: Rider[];
    vehicles: Vehicle[];
    unassigned: Unassigned[];
    counts: Counts;
    tab: string;
    search: string;
    date_from: string;
    date_to: string;
};

const STATUS_COLORS: Record<string, string> = {
    assigned:   'bg-blue-100 text-blue-700',
    picked_up:  'bg-purple-100 text-purple-700',
    in_transit: 'bg-orange-100 text-orange-700',
    delivered:  'bg-green-100 text-green-700',
    failed:     'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
    assigned:   'Assigned',
    picked_up:  'Picked Up',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

// ── Proof Timeline Panel ────────────────────────────────────────────────────────

function ProofTimeline({ proofs }: { proofs: DeliveryProof[] }) {
    const [lightbox, setLightbox] = useState<string | null>(null);

    if (proofs.length === 0) {
        return (
            <div className="px-4 py-3 text-sm text-muted-foreground italic">
                No proof photos submitted yet.
            </div>
        );
    }

    return (
        <div className="px-4 pb-4 pt-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery Updates
            </p>
            <ol className="relative border-l border-gray-200 pl-4 space-y-4">
                {proofs.map((p) => (
                    <li key={p.id} className="relative">
                        {/* dot */}
                        <span className={`absolute -left-[1.125rem] flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-white ${
                            p.status === 'delivered' ? 'bg-emerald-500' :
                            p.status === 'failed'    ? 'bg-red-500'     : 'bg-blue-500'
                        }`} />
                        <div className="grid gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {STATUS_LABELS[p.status] ?? p.status}
                                </span>
                                <span className="text-xs text-muted-foreground">{p.created_at}</span>
                            </div>
                            {p.location_note && (
                                <p className="flex items-center gap-1 text-xs text-gray-600">
                                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    {p.location_note}
                                </p>
                            )}
                            {p.notes && (
                                <p className="text-xs text-gray-600 italic">"{p.notes}"</p>
                            )}
                            {p.photo_url && (
                                <button
                                    type="button"
                                    onClick={() => setLightbox(p.photo_url!)}
                                    className="group relative w-28 h-20 overflow-hidden rounded-md border hover:opacity-90 transition-opacity"
                                >
                                    <img
                                        src={p.photo_url}
                                        alt="Proof photo"
                                        className="h-full w-full object-cover"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                        <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                                    </span>
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ol>

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={lightbox}
                        alt="Proof"
                        className="max-h-[90vh] max-w-full rounded-lg object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}

export default function SellerDeliveries({ deliveries, riders, vehicles, unassigned, counts, tab, search, date_from, date_to }: Props) {
    const [searchVal, setSearchVal]           = useState(search);
    const [dateFrom,  setDateFrom]            = useState(date_from);
    const [dateTo,    setDateTo]              = useState(date_to);
    const [assignOrderId, setAssignOrderId]   = useState('');
    const [assignRiderId, setAssignRiderId]   = useState('');
    const [assignVehicleId, setAssignVehicleId] = useState('');
    const [showAssign, setShowAssign]         = useState(false);
    const [statusTarget, setStatusTarget]     = useState<Delivery | null>(null);
    const [newStatus, setNewStatus]           = useState('');
    const [expanded, setExpanded]             = useState<number | null>(null);

    function navigate(overrides: Record<string, string> = {}) {
        router.get('/seller/deliveries', { tab, search: searchVal, date_from: dateFrom, date_to: dateTo, ...overrides }, { preserveState: true, replace: true });
    }

    function goTab(t: string) {
        navigate({ tab: t });
    }

    function doSearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        navigate();
    }

    function applyDates() { navigate(); }

    function clearDates() {
        setDateFrom('');
        setDateTo('');
        router.get('/seller/deliveries', { tab, search: searchVal, date_from: '', date_to: '' }, { preserveState: true, replace: true });
    }

    function submitAssign() {
        if (!assignOrderId || !assignRiderId) return;
        router.post('/seller/deliveries/assign', {
            order_id: assignOrderId,
            rider_id: assignRiderId,
            vehicle_id: assignVehicleId || null,
        }, {
            onSuccess: () => { setShowAssign(false); setAssignOrderId(''); setAssignRiderId(''); setAssignVehicleId(''); },
        });
    }

    function submitStatusUpdate() {
        if (!statusTarget || !newStatus) return;
        router.patch(`/seller/deliveries/${statusTarget.id}/status`, { status: newStatus }, {
            onSuccess: () => setStatusTarget(null),
        });
    }

    const TABS = [
        { key: 'active',    label: 'Active',    count: counts.active    },
        { key: 'completed', label: 'Completed', count: counts.completed },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Deliveries" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Truck className="h-6 w-6 text-blue-600" />
                            Deliveries
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">Track and manage delivery assignments.</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <form onSubmit={doSearch} className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Order # or customer…" className="pl-9 w-48" value={searchVal}
                                    onChange={(e) => setSearchVal(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">Search</Button>
                        </form>
                        {unassigned.length > 0 && (
                            <Button size="sm" onClick={() => setShowAssign(true)}>
                                <Truck className="h-4 w-4 mr-1" /> Assign Delivery
                            </Button>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label, count }) => (
                        <button key={key} onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {label}
                            {count > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${tab === key ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>{count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Date filter */}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">From</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">To</label>
                        <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                    <Button size="sm" variant="secondary" onClick={applyDates}>Apply</Button>
                    {(dateFrom || dateTo) && <Button size="sm" variant="ghost" onClick={clearDates}>Clear</Button>}
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Order</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Customer / Address</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Rider / Vehicle</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Assigned</th>
                                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deliveries.data.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No deliveries found.</td></tr>
                                    ) : deliveries.data.map((d) => (
                                        <>
                                            <tr key={d.id} className={`border-b transition-colors ${expanded === d.id ? 'bg-muted/10' : 'hover:bg-muted/20'}`}>
                                                <td className="px-4 py-3">
                                                    {d.order ? (
                                                        <>
                                                            <p className="font-mono text-xs font-medium text-blue-600">{d.order.order_number}</p>
                                                            <p className="text-xs text-muted-foreground">₱{d.order.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                                                        </>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <p className="font-medium text-xs">{d.order?.customer ?? '—'}</p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{d.order?.address ?? ''}</p>
                                                </td>
                                                <td className="px-4 py-3 hidden sm:table-cell">
                                                    <p className="text-sm">{d.rider?.name ?? '—'}</p>
                                                    {d.rider?.phone && <p className="text-xs text-muted-foreground">{d.rider.phone}</p>}
                                                    {d.vehicle && (
                                                        <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                            {VEHICLE_TYPE_LABELS[d.vehicle.vehicle_type] ?? d.vehicle.vehicle_type} · {d.vehicle.plate_number}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                        {STATUS_LABELS[d.status] ?? d.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                    {d.assigned_at ? fmtDateTime(d.assigned_at) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Proof toggle */}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 text-xs gap-1 text-muted-foreground"
                                                            onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                                                        >
                                                            {d.proofs.length > 0 && (
                                                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                                                                    {d.proofs.length}
                                                                </span>
                                                            )}
                                                            <Camera className="h-3.5 w-3.5" />
                                                            {expanded === d.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                        </Button>
                                                        {/* Status update (active tab only) */}
                                                        {tab === 'active' && (
                                                            <Button size="sm" variant="outline" className="h-7 text-xs"
                                                                onClick={() => { setStatusTarget(d); setNewStatus(d.status); }}>
                                                                Update
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* Proof timeline row */}
                                            {expanded === d.id && (
                                                <tr key={`proof-${d.id}`} className="bg-muted/5">
                                                    <td colSpan={6} className="border-b">
                                                        <ProofTimeline proofs={d.proofs} />
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {deliveries.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{deliveries.total} deliveries</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: deliveries.last_page }, (_, i) => i + 1).map((pg) => (
                                        <button key={pg}
                                            onClick={() => router.get('/seller/deliveries', { tab, search: searchVal, page: pg })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${pg === deliveries.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {pg}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Assign delivery dialog */}
            <AlertDialog open={showAssign} onOpenChange={setShowAssign}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Assign Delivery</AlertDialogTitle>
                        <AlertDialogDescription>Select an order and a rider.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <p className="text-sm font-medium">Order</p>
                            <Select value={assignOrderId} onValueChange={setAssignOrderId}>
                                <SelectTrigger><SelectValue placeholder="Select order…" /></SelectTrigger>
                                <SelectContent>
                                    {unassigned.map((o) => (
                                        <SelectItem key={o.id} value={String(o.id)}>
                                            {o.order_number} — {o.customer}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <p className="text-sm font-medium">Rider</p>
                            {riders.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No riders. Add one in Staff Management.</p>
                            ) : (
                                <Select value={assignRiderId} onValueChange={setAssignRiderId}>
                                    <SelectTrigger><SelectValue placeholder="Select rider…" /></SelectTrigger>
                                    <SelectContent>
                                        {riders.map((r) => (
                                            <SelectItem key={r.id} value={String(r.id)}>
                                                {r.name}{r.phone ? ` · ${r.phone}` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        <div className="grid gap-1.5">
                            <p className="text-sm font-medium">Vehicle <span className="text-muted-foreground font-normal">(optional)</span></p>
                            {vehicles.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No vehicles available. Add one in Vehicles.</p>
                            ) : (
                                <Select value={assignVehicleId || 'none'} onValueChange={(v) => setAssignVehicleId(v === 'none' ? '' : v)}>
                                    <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {vehicles.map((v) => (
                                            <SelectItem key={v.id} value={String(v.id)}>
                                                {VEHICLE_TYPE_LABELS[v.vehicle_type] ?? v.vehicle_type} · {v.plate_number}
                                                {' '}— {v.max_tanks} tanks / {v.max_capacity_kg} kg
                                                {v.status === 'in_use' ? ' (in use)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitAssign} disabled={!assignOrderId || !assignRiderId}
                            className="bg-blue-600 hover:bg-blue-700">Assign</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Update status dialog */}
            <AlertDialog open={!!statusTarget} onOpenChange={(o) => { if (!o) setStatusTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Update Delivery Status</AlertDialogTitle>
                        <AlertDialogDescription>Order: <strong>{statusTarget?.order?.order_number}</strong></AlertDialogDescription>
                    </AlertDialogHeader>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {['assigned', 'picked_up', 'in_transit', 'delivered', 'failed'].map((s) => (
                                <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitStatusUpdate} className="bg-blue-600 hover:bg-blue-700">Update</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
