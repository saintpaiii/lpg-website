import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Car,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type VehicleType = 'motorcycle' | 'tricycle' | 'multicab' | 'van' | 'pickup_truck' | 'small_truck' | 'large_truck';
type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

type Vehicle = {
    id: number;
    vehicle_type: VehicleType;
    plate_number: string;
    max_capacity_kg: number;
    max_tanks: number;
    description: string | null;
    status: VehicleStatus;
    assigned_rider: { id: number; name: string } | null;
    deleted_at: string | null;
};

type Rider = { id: number; name: string };

type Props = {
    vehicles: Vehicle[];
    riders: Rider[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Vehicles',  href: '/seller/vehicles'  },
];

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
    { value: 'motorcycle',   label: 'Motorcycle'   },
    { value: 'tricycle',     label: 'Tricycle'     },
    { value: 'multicab',     label: 'Multicab'     },
    { value: 'van',          label: 'Van'          },
    { value: 'pickup_truck', label: 'Pickup Truck' },
    { value: 'small_truck',  label: 'Small Truck'  },
    { value: 'large_truck',  label: 'Large Truck'  },
];

const DEFAULT_CAPACITY: Record<VehicleType, { kg: number; tanks: number }> = {
    motorcycle:   { kg: 22,   tanks: 2   },
    tricycle:     { kg: 66,   tanks: 6   },
    multicab:     { kg: 165,  tanks: 15  },
    van:          { kg: 220,  tanks: 20  },
    pickup_truck: { kg: 275,  tanks: 25  },
    small_truck:  { kg: 550,  tanks: 50  },
    large_truck:  { kg: 1100, tanks: 100 },
};

const STATUS_STYLES: Record<VehicleStatus, string> = {
    available:   'bg-emerald-100 text-emerald-700',
    in_use:      'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired:     'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<VehicleStatus, string> = {
    available:   'Available',
    in_use:      'In Use',
    maintenance: 'Maintenance',
    retired:     'Retired',
};

// ── Blank form state ───────────────────────────────────────────────────────────

function blankForm() {
    return {
        vehicle_type:      '' as VehicleType | '',
        plate_number:      '',
        max_capacity_kg:   '',
        max_tanks:         '',
        description:       '',
        status:            'available' as VehicleStatus,
        assigned_rider_id: '',
    };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function VehiclesPage({ vehicles, riders }: Props) {
    const [showForm,    setShowForm]    = useState(false);
    const [editTarget,  setEditTarget]  = useState<Vehicle | null>(null);
    const [archiveTarget, setArchiveTarget] = useState<Vehicle | null>(null);
    const [form, setForm] = useState(blankForm());
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    function openAdd() {
        setForm(blankForm());
        setErrors({});
        setEditTarget(null);
        setShowForm(true);
    }

    function openEdit(v: Vehicle) {
        setForm({
            vehicle_type:      v.vehicle_type,
            plate_number:      v.plate_number,
            max_capacity_kg:   String(v.max_capacity_kg),
            max_tanks:         String(v.max_tanks),
            description:       v.description ?? '',
            status:            v.status,
            assigned_rider_id: v.assigned_rider ? String(v.assigned_rider.id) : '',
        });
        setErrors({});
        setEditTarget(v);
        setShowForm(true);
    }

    function handleTypeChange(type: VehicleType) {
        const defaults = DEFAULT_CAPACITY[type];
        setForm(f => ({
            ...f,
            vehicle_type:    type,
            max_capacity_kg: String(defaults.kg),
            max_tanks:       String(defaults.tanks),
        }));
    }

    function submitForm() {
        setSubmitting(true);
        setErrors({});

        const payload = {
            vehicle_type:      form.vehicle_type,
            plate_number:      form.plate_number.toUpperCase().trim(),
            max_capacity_kg:   form.max_capacity_kg,
            max_tanks:         form.max_tanks,
            description:       form.description || null,
            status:            form.status,
            assigned_rider_id: form.assigned_rider_id || null,
        };

        const url    = editTarget ? `/seller/vehicles/${editTarget.id}` : '/seller/vehicles';
        const method = editTarget ? 'put' : 'post';

        router[method](url, payload, {
            preserveScroll: true,
            onSuccess: () => { setShowForm(false); },
            onError: (errs) => setErrors(errs),
            onFinish: () => setSubmitting(false),
        });
    }

    function doArchive(v: Vehicle) {
        router.delete(`/seller/vehicles/${v.id}`, { preserveScroll: true });
        setArchiveTarget(null);
    }

    function doRestore(v: Vehicle) {
        router.post(`/seller/vehicles/${v.id}/restore`, {}, { preserveScroll: true });
    }

    const active   = vehicles.filter(v => !v.deleted_at);
    const archived = vehicles.filter(v =>  v.deleted_at);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Vehicles" />

            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Car className="h-6 w-6 text-blue-600" />
                            Vehicles
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Manage your store's delivery vehicles.
                        </p>
                    </div>
                    <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="h-4 w-4 mr-1.5" /> Add Vehicle
                    </Button>
                </div>

                {/* Vehicle table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Active Vehicles</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {active.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                <Car className="h-10 w-10 mb-3 opacity-30" />
                                <p className="font-medium">No vehicles yet</p>
                                <p className="text-sm mt-1">Add your first delivery vehicle to get started.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Plate</th>
                                            <th className="px-4 py-3 hidden sm:table-cell">Capacity</th>
                                            <th className="px-4 py-3 hidden md:table-cell">Assigned Rider</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {active.map((v) => (
                                            <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-3">
                                                    <p className="font-medium capitalize">{v.vehicle_type.replace('_', ' ')}</p>
                                                    {v.description && (
                                                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">{v.description}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-sm font-semibold">{v.plate_number}</td>
                                                <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                                                    <span>{v.max_tanks} tanks</span>
                                                    <span className="ml-1 text-gray-400">/ {v.max_capacity_kg} kg</span>
                                                </td>
                                                <td className="px-4 py-3 hidden md:table-cell text-sm">
                                                    {v.assigned_rider?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status]}`}>
                                                        {STATUS_LABELS[v.status]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(v)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => setArchiveTarget(v)}
                                                            disabled={v.status === 'in_use'}
                                                            title={v.status === 'in_use' ? 'Cannot archive while in use' : 'Archive'}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Archived */}
                {archived.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-muted-foreground">Archived Vehicles</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Plate</th>
                                            <th className="px-4 py-3 hidden sm:table-cell">Capacity</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {archived.map((v) => (
                                            <tr key={v.id} className="opacity-60 hover:opacity-80">
                                                <td className="px-4 py-3 capitalize">{v.vehicle_type.replace('_', ' ')}</td>
                                                <td className="px-4 py-3 font-mono text-sm">{v.plate_number}</td>
                                                <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                                                    {v.max_tanks} tanks / {v.max_capacity_kg} kg
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => doRestore(v)}>
                                                        <RotateCcw className="h-3 w-3" /> Restore
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Edit Vehicle' : 'Add Vehicle'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Vehicle Type */}
                        <div className="grid gap-1.5">
                            <Label>Vehicle Type <span className="text-red-500">*</span></Label>
                            <Select
                                value={form.vehicle_type}
                                onValueChange={(v) => handleTypeChange(v as VehicleType)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {VEHICLE_TYPES.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.vehicle_type && <p className="text-xs text-red-500">{errors.vehicle_type}</p>}
                        </div>

                        {/* Plate Number */}
                        <div className="grid gap-1.5">
                            <Label>Plate Number <span className="text-red-500">*</span></Label>
                            <Input
                                value={form.plate_number}
                                onChange={(e) => setForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))}
                                placeholder="e.g. ABC 1234"
                                className="font-mono uppercase"
                            />
                            {errors.plate_number && <p className="text-xs text-red-500">{errors.plate_number}</p>}
                        </div>

                        {/* Capacity row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label>Max Tanks <span className="text-red-500">*</span></Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={form.max_tanks}
                                    onChange={(e) => setForm(f => ({ ...f, max_tanks: e.target.value }))}
                                    placeholder="6"
                                />
                                {errors.max_tanks && <p className="text-xs text-red-500">{errors.max_tanks}</p>}
                            </div>
                            <div className="grid gap-1.5">
                                <Label>Max Weight (kg) <span className="text-red-500">*</span></Label>
                                <Input
                                    type="number"
                                    min="1"
                                    step="0.5"
                                    value={form.max_capacity_kg}
                                    onChange={(e) => setForm(f => ({ ...f, max_capacity_kg: e.target.value }))}
                                    placeholder="66"
                                />
                                {errors.max_capacity_kg && <p className="text-xs text-red-500">{errors.max_capacity_kg}</p>}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="grid gap-1.5">
                            <Label>Description</Label>
                            <Input
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="e.g. Red Honda TMX 155"
                            />
                        </div>

                        {/* Assigned Rider */}
                        <div className="grid gap-1.5">
                            <Label>Default Assigned Rider</Label>
                            <Select
                                value={form.assigned_rider_id || 'none'}
                                onValueChange={(v) => setForm(f => ({ ...f, assigned_rider_id: v === 'none' ? '' : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="None (unassigned)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None (unassigned)</SelectItem>
                                    {riders.map((r) => (
                                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status (edit only) */}
                        {editTarget && (
                            <div className="grid gap-1.5">
                                <Label>Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(v) => setForm(f => ({ ...f, status: v as VehicleStatus }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="available">Available</SelectItem>
                                        <SelectItem value="maintenance">Maintenance</SelectItem>
                                        <SelectItem value="retired">Retired</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={submitting || !form.vehicle_type || !form.plate_number || !form.max_tanks || !form.max_capacity_kg}
                            onClick={submitForm}
                        >
                            {submitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Vehicle'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive confirmation */}
            <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Archive Vehicle?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Archive <strong>{archiveTarget?.plate_number}</strong>? It will be hidden from delivery assignment but can be restored later.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => archiveTarget && doArchive(archiveTarget)}
                        >
                            Archive
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
