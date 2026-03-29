import { Head, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Archive,
    Eye,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    Truck,
    UserCheck,
    UserX,
    Users,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type StaffMember = {
    id: number;
    name: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    sub_role: string;
    schedule_start: string | null;
    schedule_end: string | null;
    is_active: boolean;
    created_at: string;
    deleted_at: string | null;
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
    staff: Paginated<StaffMember>;
    tab: string;
    archivedCount: number;
    filters: { search?: string };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Staff', href: '/seller/staff' },
];

const SUB_ROLE_LABELS: Record<string, string> = {
    cashier:   'Cashier',
    warehouse: 'Warehouse',
    rider:     'Rider',
    hr:        'HR',
};

const SUB_ROLE_STYLES: Record<string, string> = {
    cashier:   'bg-emerald-100 text-emerald-700',
    warehouse: 'bg-amber-100 text-amber-700',
    rider:     'bg-blue-100 text-blue-700',
    hr:        'bg-purple-100 text-purple-700',
};

const DEACTIVATE_REASONS = [
    'Violation of terms of service',
    'Fraudulent activity',
    'Account security concern',
    'Customer complaint',
    'Inactivity',
    'Duplicate account',
    'User request',
    'Suspicious behavior',
    'Non-payment',
    'Other',
];

// ── Small components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUB_ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
            {SUB_ROLE_LABELS[role] ?? role}
        </span>
    );
}

function StatusBadge({ active }: { active: boolean }) {
    return active ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            Inactive
        </span>
    );
}

function Pagination({ data, onVisit }: { data: Paginated<any>; onVisit: (url: string) => void }) {
    if (data.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-gray-500">Showing {data.from}–{data.to} of {data.total}</p>
            <div className="flex gap-1">
                {data.links.map((link, i) => (
                    <button
                        key={i}
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url!)}
                        className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                            link.active ? 'bg-blue-600 text-white'
                            : link.url  ? 'hover:bg-gray-100 text-gray-600'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                        dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Staff Form Dialog ──────────────────────────────────────────────────────────

function StaffFormDialog({
    open,
    onClose,
    editTarget,
}: {
    open: boolean;
    onClose: () => void;
    editTarget: StaffMember | null;
}) {
    const isEdit = !!editTarget;

    // Normalise stored time to HH:MM (24-hour) for <input type="time">.
    // DB may store "05:30 AM" (12-hour); the time input only accepts "HH:MM".
    function toHHMM(t: string | null | undefined): string {
        if (!t) return '';
        const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return t; // already "HH:MM" or empty
        let h = parseInt(match[1], 10);
        const m = match[2];
        const period = match[3].toUpperCase();
        if (period === 'AM' && h === 12) h = 0;
        if (period === 'PM' && h !== 12) h += 12;
        return `${String(h).padStart(2, '0')}:${m}`;
    }

    const { data, setData, post, put, processing, errors, reset } = useForm<{
        first_name: string;
        middle_name: string;
        last_name: string;
        email: string;
        phone: string;
        sub_role: string;
        schedule_start: string;
        schedule_end: string;
    }>({
        first_name:     editTarget?.first_name     ?? '',
        middle_name:    editTarget?.middle_name    ?? '',
        last_name:      editTarget?.last_name      ?? '',
        email:          editTarget?.email          ?? '',
        phone:          editTarget?.phone          ?? '',
        sub_role:       editTarget?.sub_role       ?? 'cashier',
        schedule_start: toHHMM(editTarget?.schedule_start),
        schedule_end:   toHHMM(editTarget?.schedule_end),
    });

    if (isEdit && editTarget && data.email !== editTarget.email) {
        setData({
            first_name:     editTarget.first_name     ?? '',
            middle_name:    editTarget.middle_name    ?? '',
            last_name:      editTarget.last_name      ?? '',
            email:          editTarget.email,
            phone:          editTarget.phone          ?? '',
            sub_role:       editTarget.sub_role,
            schedule_start: toHHMM(editTarget.schedule_start),
            schedule_end:   toHHMM(editTarget.schedule_end),
        });
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (isEdit) {
            put(`/seller/staff/${editTarget?.id}`, {
                onSuccess: () => { reset(); onClose(); },
            });
        } else {
            post('/seller/staff', {
                onSuccess: () => { reset(); onClose(); },
            });
        }
    }

    function handleClose() { reset(); onClose(); }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEdit ? <Pencil className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-blue-600" />}
                        {isEdit ? 'Edit Staff Account' : 'Add Staff Account'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4">
                    {/* Name fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label>First Name <span className="text-red-500">*</span></Label>
                            <Input value={data.first_name} onChange={(e) => setData('first_name', e.target.value)} placeholder="Juan" />
                            {errors.first_name && <p className="text-xs text-red-500">{errors.first_name}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Last Name <span className="text-red-500">*</span></Label>
                            <Input value={data.last_name} onChange={(e) => setData('last_name', e.target.value)} placeholder="Dela Cruz" />
                            {errors.last_name && <p className="text-xs text-red-500">{errors.last_name}</p>}
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Middle Name <span className="text-xs text-gray-400">(optional)</span></Label>
                        <Input value={data.middle_name} onChange={(e) => setData('middle_name', e.target.value)} placeholder="Santos" />
                        {errors.middle_name && <p className="text-xs text-red-500">{errors.middle_name}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Email <span className="text-red-500">*</span></Label>
                        <Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} placeholder="juan@example.com" />
                        {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Phone <span className="text-xs text-gray-400">(optional)</span></Label>
                        <Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} placeholder="09XXXXXXXXX" />
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Role <span className="text-red-500">*</span></Label>
                        <Select value={data.sub_role} onValueChange={(v) => setData('sub_role', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cashier">Cashier</SelectItem>
                                <SelectItem value="warehouse">Warehouse</SelectItem>
                                <SelectItem value="rider">Rider</SelectItem>
                                <SelectItem value="hr">HR</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.sub_role && <p className="text-xs text-red-500">{errors.sub_role}</p>}
                    </div>

                    {/* Work schedule */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label>Schedule Start <span className="text-xs text-gray-400">(optional)</span></Label>
                            <Input
                                type="time"
                                value={data.schedule_start}
                                onChange={(e) => setData('schedule_start', e.target.value)}
                            />
                            {errors.schedule_start && <p className="text-xs text-red-500">{errors.schedule_start}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Schedule End <span className="text-xs text-gray-400">(optional)</span></Label>
                            <Input
                                type="time"
                                value={data.schedule_end}
                                onChange={(e) => setData('schedule_end', e.target.value)}
                            />
                            {errors.schedule_end && <p className="text-xs text-red-500">{errors.schedule_end}</p>}
                        </div>
                    </div>

                    {!isEdit && (
                        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            Password defaults to their last name (lowercase). They will be asked to change it on first login. Login credentials will be emailed to them.
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button type="submit" disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {processing && <Spinner className="mr-1.5" />}
                            {processing ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Account')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Archive / Force Delete Dialogs ─────────────────────────────────────────────

function ArchiveDialog({ target, onClose }: { target: StaffMember | null; onClose: () => void }) {
    const { data, setData, delete: destroy, processing, reset } = useForm({ reason: '', notes: '' });

    function handleClose() { reset(); onClose(); }

    return (
        <Dialog open={!!target} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Archive Staff Account?</DialogTitle>
                    <DialogDescription>
                        Archive <span className="font-semibold">{target?.name}</span>? Their account will be deactivated. You can restore it later.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-1.5">
                        <Label>Reason <span className="text-red-500">*</span></Label>
                        <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={data.reason}
                            onChange={(e) => setData('reason', e.target.value)}
                        >
                            <option value="">Select a reason…</option>
                            {DEACTIVATE_REASONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            rows={3}
                            placeholder="Additional context…"
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={!data.reason || processing}
                        onClick={() => target && destroy(`/seller/staff/${target.id}`, {
                            onSuccess: handleClose,
                        })}
                    >
                        {processing ? 'Archiving…' : 'Archive'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ForceDeleteDialog({ target, onClose }: { target: StaffMember | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();
    return (
        <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Permanently delete <span className="font-semibold">{target?.name}</span>? This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={processing}
                        onClick={() => target && destroy(`/seller/staff/${target.id}/force`, {
                            onSuccess: onClose,
                        })}
                    >
                        {processing ? 'Deleting…' : 'Delete Permanently'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SellerStaff({ staff, tab, archivedCount, filters }: Props) {
    const [formOpen, setFormOpen]               = useState(false);
    const [editTarget, setEditTarget]           = useState<StaffMember | null>(null);
    const [archiveTarget, setArchiveTarget]     = useState<StaffMember | null>(null);
    const [forceTarget, setForceTarget]         = useState<StaffMember | null>(null);
    const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
    const [search, setSearch]                   = useState(filters.search ?? '');

    const deactivateForm = useForm({ reason: '', notes: '' });

    const isArchived = tab === 'archived';

    function switchTab(newTab: string) {
        router.get('/seller/staff', { tab: newTab }, { preserveState: false });
    }

    function applySearch(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        router.get('/seller/staff', { tab, search: search || undefined }, { preserveState: true, replace: true });
    }

    function handleToggle(s: StaffMember) {
        if (s.is_active) {
            setDeactivateTarget(s);
        } else {
            router.patch(`/seller/staff/${s.id}/toggle`, {}, { preserveScroll: true });
        }
    }

    function submitDeactivate() {
        if (!deactivateTarget) return;
        deactivateForm.patch(`/seller/staff/${deactivateTarget.id}/toggle`, {
            preserveScroll: true,
            onSuccess: () => { setDeactivateTarget(null); deactivateForm.reset(); },
        });
    }

    function handleRestore(s: StaffMember) {
        router.post(`/seller/staff/${s.id}/restore`, {}, { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Staff" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Users className="h-6 w-6 text-blue-600" />
                            Staff Management
                        </h1>
                        <p className="mt-0.5 text-sm text-gray-500">Manage your store's staff accounts and permissions.</p>
                    </div>
                    {!isArchived && (
                        <Button onClick={() => { setEditTarget(null); setFormOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus className="mr-1.5 h-4 w-4" /> Add Staff
                        </Button>
                    )}
                </div>

                {/* Summary cards */}
                {!isArchived && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{staff.total}</div>
                                <p className="text-xs text-muted-foreground">active accounts</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Riders</CardTitle>
                                <Truck className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    {staff.data.filter((s) => s.sub_role === 'rider').length}
                                </div>
                                <p className="text-xs text-muted-foreground">delivery staff</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Archived</CardTitle>
                                <Archive className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-400">{archivedCount}</div>
                                <p className="text-xs text-muted-foreground">inactive accounts</p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex gap-6">
                        {['active', 'archived'].map((t) => (
                            <button key={t} onClick={() => switchTab(t)}
                                className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors capitalize flex items-center gap-1.5 ${
                                    tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}>
                                {t}
                                {t === 'archived' && archivedCount > 0 && (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{archivedCount}</span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Search */}
                <form onSubmit={applySearch} className="flex gap-2 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input className="pl-8" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Search</Button>
                    {search && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); router.get('/seller/staff', { tab }); }}>Clear</Button>
                    )}
                </form>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            {isArchived ? 'Archived Staff' : 'Staff Members'}
                            <span className="ml-auto text-sm font-normal text-gray-400">{staff.total} record{staff.total !== 1 ? 's' : ''}</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {staff.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Users className="mb-3 h-10 w-10" />
                                <p className="font-medium">{isArchived ? 'No archived staff' : 'No staff members yet'}</p>
                                {!isArchived && <p className="mt-1 text-sm">Click "Add Staff" to create the first account.</p>}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-4 py-3">Name</th>
                                            <th className="px-4 py-3">Role</th>
                                            <th className="px-4 py-3">Phone</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Joined</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {staff.data.map((s) => (
                                            <tr key={s.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <button onClick={() => router.visit(`/seller/staff/${s.id}`)} className="text-left hover:underline">
                                                        <p className="font-medium text-gray-900 hover:text-blue-600 transition-colors">{s.name}</p>
                                                        <p className="text-xs text-gray-400">{s.email}</p>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3"><RoleBadge role={s.sub_role} /></td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{s.phone ?? '—'}</td>
                                                <td className="px-4 py-3">
                                                    {isArchived ? (
                                                        <span className="text-xs text-gray-400">Archived {s.deleted_at ? fmtDate(s.deleted_at) : ''}</span>
                                                    ) : (
                                                        <StatusBadge active={s.is_active} />
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(s.created_at)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isArchived ? (
                                                            <>
                                                                <Button size="sm" variant="ghost" onClick={() => handleRestore(s)}
                                                                    className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50" title="Restore">
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button size="sm" variant="ghost" onClick={() => setForceTarget(s)}
                                                                    className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete permanently">
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button size="sm" variant="ghost" onClick={() => router.visit(`/seller/staff/${s.id}`)}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="View & permissions">
                                                                    <Eye className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button size="sm" variant="ghost" onClick={() => { setEditTarget(s); setFormOpen(true); }}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button size="sm" variant="ghost" onClick={() => handleToggle(s)}
                                                                    className={`h-7 w-7 p-0 ${s.is_active ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-700' : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
                                                                    title={s.is_active ? 'Deactivate' : 'Activate'}>
                                                                    {s.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                                                </Button>
                                                                <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(s)}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Archive">
                                                                    <Archive className="h-3.5 w-3.5" />
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
                        <Pagination data={staff} onVisit={(url) => router.visit(url, { preserveState: true })} />
                    </CardContent>
                </Card>
            </div>

            <StaffFormDialog open={formOpen} onClose={() => { setFormOpen(false); setEditTarget(null); }} editTarget={editTarget} />
            <ArchiveDialog target={archiveTarget} onClose={() => setArchiveTarget(null)} />
            <ForceDeleteDialog target={forceTarget} onClose={() => setForceTarget(null)} />

            {/* Deactivate dialog */}
            <Dialog open={!!deactivateTarget} onOpenChange={(o) => { if (!o) { setDeactivateTarget(null); deactivateForm.reset(); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Deactivate {deactivateTarget?.name}?
                        </DialogTitle>
                        <DialogDescription>
                            The staff member will be blocked from logging in. You can reactivate them at any time.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="grid gap-1.5">
                            <Label>Reason <span className="text-red-500">*</span></Label>
                            <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                value={deactivateForm.data.reason}
                                onChange={(e) => deactivateForm.setData('reason', e.target.value)}
                            >
                                <option value="">Select a reason…</option>
                                {DEACTIVATE_REASONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <textarea
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                rows={3}
                                placeholder="Additional context…"
                                value={deactivateForm.data.notes}
                                onChange={(e) => deactivateForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeactivateTarget(null); deactivateForm.reset(); }}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!deactivateForm.data.reason || deactivateForm.processing}
                            onClick={submitDeactivate}
                        >
                            {deactivateForm.processing ? 'Deactivating…' : 'Deactivate'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
