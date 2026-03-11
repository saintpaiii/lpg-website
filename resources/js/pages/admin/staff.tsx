import { Head, router, useForm } from '@inertiajs/react';
import {
    Archive,
    Eye,
    Filter,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────────────────────

type StaffMember = {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
    deleted_at: string | null;
    today_deliveries: number;
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
    filters: { role?: string; search?: string; tab?: string };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Staff Management', href: '/admin/staff' }];

const ROLE_LABELS: Record<string, string> = {
    manager:   'Manager',
    cashier:   'Cashier',
    warehouse: 'Warehouse',
    rider:     'Rider',
};

const ROLE_STYLES: Record<string, string> = {
    manager:   'bg-purple-100 text-purple-700',
    cashier:   'bg-emerald-100 text-emerald-700',
    warehouse: 'bg-amber-100 text-amber-700',
    rider:     'bg-blue-100 text-blue-700',
};

// ── Small components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABELS[role] ?? role}
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

    const { data, setData, post, put, processing, errors, reset } = useForm<{
        name: string;
        email: string;
        password: string;
        phone: string;
        role: string;
    }>({
        name:     editTarget?.name  ?? '',
        email:    editTarget?.email ?? '',
        password: '',
        phone:    editTarget?.phone ?? '',
        role:     editTarget?.role  ?? 'rider',
    });

    // Sync when edit target changes
    if (isEdit && data.name !== editTarget.name && data.email !== editTarget.email) {
        setData({ name: editTarget.name, email: editTarget.email, password: '', phone: editTarget.phone ?? '', role: editTarget.role });
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (isEdit) {
            put(`/admin/staff/${editTarget!.id}`, {
                onSuccess: () => { reset(); onClose(); toast.success('Staff account updated.'); },
            });
        } else {
            post('/admin/staff', {
                onSuccess: () => { reset(); onClose(); toast.success('Staff account created.'); },
            });
        }
    }

    function handleClose() {
        reset();
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEdit ? <Pencil className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-blue-600" />}
                        {isEdit ? 'Edit Staff Account' : 'Add Staff Account'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label>Full Name *</Label>
                        <Input
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            placeholder="Juan Dela Cruz"
                        />
                        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Email *</Label>
                        <Input
                            type="email"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            placeholder="juan@example.com"
                        />
                        {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>{isEdit ? 'New Password (leave blank to keep current)' : 'Password *'}</Label>
                        <Input
                            type="password"
                            value={data.password}
                            onChange={(e) => setData('password', e.target.value)}
                            placeholder={isEdit ? '••••••••' : 'Minimum 8 characters'}
                            autoComplete="new-password"
                        />
                        {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Phone</Label>
                        <Input
                            value={data.phone}
                            onChange={(e) => setData('phone', e.target.value)}
                            placeholder="09XXXXXXXXX"
                        />
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Role *</Label>
                        <Select value={data.role} onValueChange={(v) => setData('role', v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="cashier">Cashier</SelectItem>
                                <SelectItem value="warehouse">Warehouse</SelectItem>
                                <SelectItem value="rider">Rider</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.role && <p className="text-xs text-red-500">{errors.role}</p>}
                    </div>

                    {!isEdit && (
                        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            The staff member will use these credentials to log in to the system.
                            Please share them securely.
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            type="submit"
                            disabled={processing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {processing ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Account')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ── Delete / Archive Dialog ────────────────────────────────────────────────────

function ArchiveDialog({ target, onClose }: { target: StaffMember | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();

    function handleConfirm() {
        if (!target) return;
        destroy(`/admin/staff/${target.id}`, {
            onSuccess: () => { onClose(); toast.success('Staff account archived.'); },
        });
    }

    return (
        <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Archive Staff Account?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Archive <span className="font-semibold">{target?.name}</span>? Their account will be deactivated
                        and they will no longer be able to log in. You can restore it later.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={handleConfirm}
                        disabled={processing}
                    >
                        {processing ? 'Archiving…' : 'Archive'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// ── Force Delete Dialog ────────────────────────────────────────────────────────

function ForceDeleteDialog({ target, onClose }: { target: StaffMember | null; onClose: () => void }) {
    const { delete: destroy, processing } = useForm();

    function handleConfirm() {
        if (!target) return;
        destroy(`/admin/staff/${target.id}/force`, {
            onSuccess: () => { onClose(); toast.success('Staff account permanently deleted.'); },
        });
    }

    return (
        <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Permanently Delete?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Permanently delete <span className="font-semibold">{target?.name}</span>?
                        All their data will be erased. This cannot be undone.
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

export default function StaffPage({ staff, tab, archivedCount, filters }: Props) {
    const [formOpen, setFormOpen]           = useState(false);
    const [editTarget, setEditTarget]       = useState<StaffMember | null>(null);
    const [archiveTarget, setArchiveTarget] = useState<StaffMember | null>(null);
    const [forceTarget, setForceTarget]     = useState<StaffMember | null>(null);

    const [search, setSearch] = useState(filters.search ?? '');
    const [role, setRole]     = useState(filters.role ?? '');

    const isArchived = tab === 'archived';

    function switchTab(newTab: string) {
        router.get('/admin/staff', { tab: newTab }, { preserveState: false });
    }

    function applyFilters() {
        router.get('/admin/staff', { tab, search: search || undefined, role: role || undefined }, { preserveState: true, replace: true });
    }

    function clearFilters() {
        setSearch(''); setRole('');
        router.get('/admin/staff', { tab }, { preserveState: false });
    }

    function openAdd() {
        setEditTarget(null);
        setFormOpen(true);
    }

    function openEdit(s: StaffMember) {
        setEditTarget(s);
        setFormOpen(true);
    }

    function handleToggle(s: StaffMember) {
        router.patch(`/admin/staff/${s.id}/toggle`, {}, {
            preserveScroll: true,
            onSuccess: () => toast.success(s.is_active ? 'Account deactivated.' : 'Account activated.'),
        });
    }

    function handleRestore(s: StaffMember) {
        router.post(`/admin/staff/${s.id}/restore`, {}, {
            preserveScroll: true,
            onSuccess: () => toast.success('Staff account restored.'),
        });
    }

    const hasFilters = search || role;
    const onDutyCount = staff.data.filter((s) => s.today_deliveries > 0).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Staff Management" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
                        <p className="mt-0.5 text-sm text-gray-500">
                            Manage staff accounts, roles, and permissions.
                        </p>
                    </div>
                    {!isArchived && (
                        <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus className="mr-1.5 h-4 w-4" />
                            Add Staff
                        </Button>
                    )}
                </div>

                {/* Summary cards — active tab only */}
                {!isArchived && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{staff.total}</div>
                                <p className="text-xs text-muted-foreground">registered accounts</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">On Duty Today</CardTitle>
                                <Truck className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">{onDutyCount}</div>
                                <p className="text-xs text-muted-foreground">with active deliveries</p>
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
                        <button
                            onClick={() => switchTab('active')}
                            className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                !isArchived ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => switchTab('archived')}
                            className={`flex items-center gap-1.5 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                                isArchived ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    <CardContent className="pt-4 pb-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    className="pl-8"
                                    placeholder="Search by name, email, phone…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                />
                            </div>
                            <Select value={role || 'all'} onValueChange={(v) => setRole(v === 'all' ? '' : v)}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All roles" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All roles</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="cashier">Cashier</SelectItem>
                                    <SelectItem value="warehouse">Warehouse</SelectItem>
                                    <SelectItem value="rider">Rider</SelectItem>
                                </SelectContent>
                            </Select>
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
                            <Users className="h-4 w-4 text-blue-600" />
                            {isArchived ? 'Archived Staff' : 'Staff Members'}
                            <span className="ml-auto text-sm font-normal text-gray-400">
                                {staff.total} record{staff.total !== 1 ? 's' : ''}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {staff.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Users className="mb-3 h-10 w-10" />
                                <p className="font-medium">
                                    {isArchived ? 'No archived staff' : 'No staff members yet'}
                                </p>
                                {!isArchived && (
                                    <p className="mt-1 text-sm">Click "Add Staff" to create the first account.</p>
                                )}
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
                                            {!isArchived && <th className="px-4 py-3 text-center">Today's Deliveries</th>}
                                            <th className="px-4 py-3">Joined</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {staff.data.map((s) => (
                                            <tr key={s.id} className="hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => router.visit(`/admin/staff/${s.id}`)}
                                                        className="text-left hover:underline"
                                                    >
                                                        <p className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                                                            {s.name}
                                                        </p>
                                                        <p className="text-xs text-gray-400">{s.email}</p>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <RoleBadge role={s.role} />
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">
                                                    {s.phone ?? '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isArchived ? (
                                                        <span className="text-xs text-gray-400">Archived {s.deleted_at}</span>
                                                    ) : (
                                                        <StatusBadge active={s.is_active} />
                                                    )}
                                                </td>
                                                {!isArchived && (
                                                    <td className="px-4 py-3 text-center">
                                                        {s.today_deliveries > 0 ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                                                <Truck className="h-3 w-3" />
                                                                {s.today_deliveries}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-xs text-gray-500">{s.created_at}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {isArchived ? (
                                                            <>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => handleRestore(s)}
                                                                    className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                                                    title="Restore"
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => setForceTarget(s)}
                                                                    className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                                                                    title="Delete permanently"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => router.visit(`/admin/staff/${s.id}`)}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                                                    title="View & manage permissions"
                                                                >
                                                                    <Eye className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => openEdit(s)}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => handleToggle(s)}
                                                                    className={`h-7 w-7 p-0 ${s.is_active ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-700' : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'}`}
                                                                    title={s.is_active ? 'Deactivate' : 'Activate'}
                                                                >
                                                                    {s.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                                                </Button>
                                                                <Button
                                                                    size="sm" variant="ghost"
                                                                    onClick={() => setArchiveTarget(s)}
                                                                    className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                                                    title="Archive"
                                                                >
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

            {/* Dialogs */}
            <StaffFormDialog
                open={formOpen}
                onClose={() => { setFormOpen(false); setEditTarget(null); }}
                editTarget={editTarget}
            />
            <ArchiveDialog target={archiveTarget} onClose={() => setArchiveTarget(null)} />
            <ForceDeleteDialog target={forceTarget} onClose={() => setForceTarget(null)} />
        </AppLayout>
    );
}
