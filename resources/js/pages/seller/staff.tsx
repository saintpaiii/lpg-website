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
import { FormEvent, useEffect, useState } from 'react';
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
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { ReasonPicker } from '@/components/reason-picker';
import { PAUSED_BADGE, PlanLimitBar, type PlanLimit } from '@/components/plan-limit-bar';
import { toast } from 'sonner';
import { DEFAULT_WORK_DAYS, fmtWorkDays, RolesChecklist, RolesTab, WorkDaysPicker, type ModuleDef, type StoreRoleRow } from '@/components/staff-roles';

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
    /** Names / ids of their store roles */
    role_names?: string[];
    role_ids?: number[];
    /** ISO weekdays 1=Mon…7=Sun */
    work_days?: number[];
    schedule_start: string | null;
    schedule_end: string | null;
    is_active: boolean;
    paused_by_plan: boolean;
    /** The store's only rider who can deliver — removing them hides the store */
    is_last_eligible_rider?: boolean;
    created_at: string;
    deleted_at: string | null;
    /** Riders only: driver's license status */
    license_status?: string | null;
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
    pausedCount?: number;
    planLimit?: PlanLimit;
    filters: { search?: string };
    /** Only right after creating an account whose welcome email failed (shown once). */
    tempCredentials?: { name: string; email: string; password: string } | null;
    /** The store's roles (Roles tab + the Add / Edit form) */
    roles?: StoreRoleRow[];
    /** Pro plan and up (or the trial): roles can be created / edited / deleted */
    canEditRoles?: boolean;
    modules?: ModuleDef[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/seller/dashboard' },
    { title: 'Staff', href: '/seller/staff' },
];

/** Small driver's-license badge for riders in the staff list. */
function LicenseBadge({ status }: { status: string }) {
    const [cls, text] = ({
        valid:    ['bg-green-100 text-green-700', 'License OK'],
        expiring: ['bg-amber-100 text-amber-700', 'License OK'],
        pending:  ['bg-blue-100 text-blue-700', 'Waiting approval'],
        expired:  ['bg-red-100 text-red-700', 'Expired'],
        rejected: ['bg-red-100 text-red-700', 'License missing'],
        missing:  ['bg-red-100 text-red-700', 'License missing'],
    } as Record<string, [string, string]>)[status] ?? ['bg-gray-100 text-gray-600', status];
    return <span className={`ml-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{text}</span>;
}

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

// ── Small components ───────────────────────────────────────────────────────────

/** "08:00" / "08:00 AM" → "8:00 AM" */
function fmtTime(t: string): string {
    const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!m) return t;
    let h = parseInt(m[1], 10);
    const ap = m[3]?.toUpperCase() ?? (h >= 12 ? 'PM' : 'AM');
    if (!m[3]) h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
}

function RoleBadge({ role, names }: { role: string; names?: string[] }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUB_ROLE_STYLES[role] ?? 'bg-gray-100 text-gray-600'}`}>
            {names?.length ? names.join(', ') : (SUB_ROLE_LABELS[role] ?? role)}
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
    roles,
}: {
    open: boolean;
    onClose: () => void;
    editTarget: StaffMember | null;
    roles: StoreRoleRow[];
}) {
    const isEdit = !!editTarget;
    // "Add a rider" (store hidden banner) pre-selects the Rider starter role, otherwise Cashier
    const [defaultRoles] = useState<number[]>(() => {
        const key = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('add') === 'rider' ? 'rider' : 'cashier';
        const r = roles.find((x) => x.starter_key === key);
        return r ? [r.id] : [];
    });

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
        role_ids: number[];
        work_days: number[];
        schedule_start: string;
        schedule_end: string;
    }>({
        first_name:     editTarget?.first_name     ?? '',
        middle_name:    editTarget?.middle_name    ?? '',
        last_name:      editTarget?.last_name      ?? '',
        email:          editTarget?.email          ?? '',
        phone:          editTarget?.phone          ?? '',
        role_ids:       editTarget?.role_ids       ?? defaultRoles,
        work_days:      editTarget?.work_days      ?? DEFAULT_WORK_DAYS,
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
            role_ids:       editTarget.role_ids ?? [],
            work_days:      editTarget.work_days ?? DEFAULT_WORK_DAYS,
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
                        <Input
                            type="tel"
                            value={data.phone}
                            onChange={(e) => setData('phone', e.target.value.replace(/\D/g, '').slice(0, 11))}
                            placeholder="09xxxxxxxxx"
                            maxLength={11}
                        />
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Roles <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">(one or more)</span></Label>
                        <RolesChecklist roles={roles} value={data.role_ids} onChange={(ids) => setData('role_ids', ids)} />
                        {(errors.role_ids || (errors as Record<string, string>)['role_ids.0']) && (
                            <p className="text-xs text-red-500">{errors.role_ids ?? (errors as Record<string, string>)['role_ids.0']}</p>
                        )}
                        {isEdit && editTarget?.is_last_eligible_rider && !roles.some((r) => r.is_rider && data.role_ids.includes(r.id)) && <LastRiderWarning />}
                    </div>

                    {/* Work schedule */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label>Schedule Start <span className="text-red-500">*</span></Label>
                            <Input
                                type="time"
                                required
                                value={data.schedule_start}
                                onChange={(e) => setData('schedule_start', e.target.value)}
                            />
                            {errors.schedule_start && <p className="text-xs text-red-500">{errors.schedule_start}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Schedule End <span className="text-red-500">*</span></Label>
                            <Input
                                type="time"
                                required
                                value={data.schedule_end}
                                onChange={(e) => setData('schedule_end', e.target.value)}
                            />
                            {errors.schedule_end && <p className="text-xs text-red-500">{errors.schedule_end}</p>}
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Work days</Label>
                        <WorkDaysPicker value={data.work_days} onChange={(d) => setData('work_days', d)} />
                        <p className="text-xs text-gray-400">Other days show as "Day off" (never absent). Clocking in on a day off is allowed and counted as an extra day.</p>
                        {errors.work_days && <p className="text-xs text-red-500">{errors.work_days}</p>}
                    </div>

                    {!isEdit && (
                        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            A random password is emailed to them. They will be asked to change it on first login.
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
                    {target?.is_last_eligible_rider && <LastRiderWarning />}
                    <DialogDescription>
                        Archive <span className="font-semibold">{target?.name}</span>? Their account will be deactivated. You can restore it later.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <ReasonPicker
                        context="account_seller_staff"
                        reasonLabel="Reason"
                        reason={data.reason}
                        notes={data.notes}
                        onChange={(next) => { setData('reason', next.reason); setData('notes', next.notes); }}
                        rows={3}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={!data.reason || !data.notes.trim() || processing}
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

/** Shown before removing / pausing / changing the store's only rider who can deliver. */
export function LastRiderWarning() {
    return (
        <p className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This is your only rider who can deliver — your products will be hidden from customers.
        </p>
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

export default function SellerStaff({ staff, tab, archivedCount, pausedCount = 0, planLimit, filters, tempCredentials, roles = [], canEditRoles = false, modules = [] }: Props) {
    const [creds, setCreds] = useState(tempCredentials ?? null);
    useEffect(() => { if (tempCredentials) setCreds(tempCredentials); }, [tempCredentials]);
    const [formOpen, setFormOpen]               = useState(false);
    const [editTarget, setEditTarget]           = useState<StaffMember | null>(null);
    const [archiveTarget, setArchiveTarget]     = useState<StaffMember | null>(null);
    const [forceTarget, setForceTarget]         = useState<StaffMember | null>(null);
    const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
    const [search, setSearch]                   = useState(filters.search ?? '');

    const deactivateForm = useForm({ reason: '', notes: '' });

    // From the "hidden from customers" banner: open Add Staff with Rider selected
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('add') === 'rider' && (!planLimit || planLimit.can_add)) setFormOpen(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Plan limit: pause one account / activate a paused one (the server checks the limit)
    function togglePlanPause(s: StaffMember) {
        if (s.paused_by_plan && s.is_active && planLimit && !planLimit.can_add) {
            toast.error(planLimit.message);
            return;
        }
        if (!s.paused_by_plan && s.is_last_eligible_rider
            && !window.confirm('This is your only rider who can deliver — your products will be hidden from customers. Pause anyway?')) {
            return;
        }
        router.patch(`/seller/staff/${s.id}/plan-pause`, {}, { preserveScroll: true });
    }

    function openAdd() {
        if (planLimit && !planLimit.can_add) {
            toast.error(planLimit.message);
            return;
        }
        setEditTarget(null);
        setFormOpen(true);
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Staff" />

            <div className="flex flex-1 flex-col gap-6 p-6">

                {/* Welcome email failed — show the temporary password once, to the owner only */}
                {creds && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="font-semibold">Account created, but the welcome email couldn't be sent.</p>
                                <p>
                                    Give <strong>{creds.name}</strong> ({creds.email}) this temporary password:{' '}
                                    <code className="rounded bg-white px-1.5 py-0.5 font-mono text-base font-bold dark:bg-amber-900/60">{creds.password}</code>
                                </p>
                                <p className="text-xs">They'll be asked to change it on first login. It won't be shown again.</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(creds.password); toast.success('Password copied.'); }}>Copy</Button>
                                <Button size="sm" variant="ghost" onClick={() => setCreds(null)}>Dismiss</Button>
                            </div>
                        </div>
                    </div>
                )}

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
                        <Button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus className="mr-1.5 h-4 w-4" /> Add Staff
                        </Button>
                    )}
                </div>

                <PlanLimitBar label="Staff accounts" planLimit={planLimit} />

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
                        {['active', 'paused', 'archived', 'roles'].map((t) => (
                            <button key={t} onClick={() => switchTab(t)}
                                className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors capitalize flex items-center gap-1.5 ${
                                    tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}>
                                {t === 'paused' ? 'Paused (plan)' : t}
                                {t === 'archived' && archivedCount > 0 && (
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{archivedCount}</span>
                                )}
                                {t === 'paused' && pausedCount > 0 && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{pausedCount}</span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                {tab === 'roles' && <RolesTab roles={roles} modules={modules} canEdit={canEditRoles} />}

                {tab !== 'roles' && (<>
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
                                                <td className="px-4 py-3">
                                                    <RoleBadge role={s.sub_role} names={s.role_names} />
                                                    {s.license_status && <LicenseBadge status={s.license_status} />}
                                                    <p className="mt-1 text-xs text-gray-400">
                                                        {fmtWorkDays(s.work_days)}{s.schedule_start && s.schedule_end ? ` · ${fmtTime(s.schedule_start)}–${fmtTime(s.schedule_end)}` : ''}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500">{s.phone ?? '—'}</td>
                                                <td className="px-4 py-3">
                                                    {isArchived ? (
                                                        <span className="text-xs text-gray-400">Archived {s.deleted_at ? fmtDate(s.deleted_at) : ''}</span>
                                                    ) : s.paused_by_plan ? (
                                                        <span className={PAUSED_BADGE}>Paused — over plan limit</span>
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
                                                                {(s.paused_by_plan || planLimit?.limit != null) && (
                                                                    <Button size="sm" variant="outline" onClick={() => togglePlanPause(s)}
                                                                        className="h-7 px-2 text-xs" title={s.paused_by_plan ? 'Activate (counts against your plan)' : 'Pause (plan limit)'}>
                                                                        {s.paused_by_plan ? 'Activate' : 'Pause (plan limit)'}
                                                                    </Button>
                                                                )}
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
                </>)}
            </div>

            <StaffFormDialog open={formOpen} onClose={() => { setFormOpen(false); setEditTarget(null); }} editTarget={editTarget} roles={roles} />
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
                        {deactivateTarget?.is_last_eligible_rider && <LastRiderWarning />}
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <ReasonPicker
                            context="account_seller_staff"
                            reasonLabel="Reason"
                            reason={deactivateForm.data.reason}
                            notes={deactivateForm.data.notes}
                            onChange={(next) => { deactivateForm.setData('reason', next.reason); deactivateForm.setData('notes', next.notes); }}
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeactivateTarget(null); deactivateForm.reset(); }}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!deactivateForm.data.reason || !deactivateForm.data.notes.trim() || deactivateForm.processing}
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
