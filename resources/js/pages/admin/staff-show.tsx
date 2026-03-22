import { Head, router, useForm } from '@inertiajs/react';
import { toast } from 'sonner';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    ArrowLeft,
    Calendar,
    Clock,
    Mail,
    Phone,
    RotateCcw,
    Save,
    Shield,
    UserCheck,
    UserX,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Staff {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    sub_role: string | null;
    is_active: boolean;
    deactivation_reason: string | null;
    deactivation_notes: string | null;
    deactivated_at: string | null;
    created_at: string;
}

interface ActionHistory {
    id: number;
    action: string;
    reason: string | null;
    notes: string | null;
    performed_by: string;
    created_at: string;
}

const POSITION_LABELS: Record<string, string> = {
    manager:       'Manager',
    moderator:     'Moderator',
    support_staff: 'Support Staff',
    accountant:    'Accountant',
};

const POSITION_STYLES: Record<string, string> = {
    manager:       'bg-purple-100 text-purple-700',
    moderator:     'bg-blue-100 text-blue-700',
    support_staff: 'bg-teal-100 text-teal-700',
    accountant:    'bg-amber-100 text-amber-700',
};

interface PermDef {
    id: number;
    name: string;
    description: string | null;
}

interface UserOverride {
    permission: string;
    granted: boolean;
}

interface Props {
    staff: Staff;
    allPermissions: Record<string, PermDef[]>;
    roleDefaults: string[];
    userOverrides: UserOverride[];
    history: ActionHistory[];
}

const DEACTIVATE_REASONS = [
    'Policy Violation',
    'Fraudulent Activity',
    'Inappropriate Behavior',
    'Account Inactivity',
    'Duplicate Account',
    'Failed Identity Verification',
    'Staff Resignation',
    'Staff Termination',
    'Pending Investigation',
    'Other',
];

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    deactivate: { label: 'Deactivated',  color: 'bg-red-100 text-red-700'      },
    activate:   { label: 'Activated',    color: 'bg-green-100 text-green-700'  },
    archive:    { label: 'Archived',     color: 'bg-gray-100 text-gray-700'    },
    restore:    { label: 'Restored',     color: 'bg-blue-100 text-blue-700'    },
};

// ── Change Position ───────────────────────────────────────────────────────────

function ChangePosition({ staff }: { staff: Staff }) {
    const [selected, setSelected] = useState(staff.sub_role ?? '');
    const [saving, setSaving]     = useState(false);

    function handleSave() {
        if (!selected) return;
        setSaving(true);
        router.patch(
            `/admin/staff/${staff.id}/position`,
            { sub_role: selected },
            {
                preserveScroll: true,
                onSuccess: () => toast.success('Position updated.'),
                onFinish: () => setSaving(false),
            }
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Position</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Display label only — actual access is controlled by the permission checkboxes below.
                </p>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                    <Select value={selected} onValueChange={setSelected}>
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select position…" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="moderator">Moderator</SelectItem>
                            <SelectItem value="support_staff">Support Staff</SelectItem>
                            <SelectItem value="accountant">Accountant</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving || !selected || selected === staff.sub_role}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {saving ? 'Saving…' : 'Save Position'}
                    </Button>
                    {selected && selected !== staff.sub_role && (
                        <p className="text-xs text-muted-foreground">Unsaved change</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ── Permission Manager ────────────────────────────────────────────────────────

function PermissionManager({
    staff,
    allPermissions,
    roleDefaults,
    userOverrides,
}: {
    staff: Staff;
    allPermissions: Record<string, PermDef[]>;
    roleDefaults: string[];
    userOverrides: UserOverride[];
}) {
    // For platform staff: roleDefaults is always []. Checked = explicitly granted.
    function buildChecked() {
        const map: Record<string, boolean> = {};
        roleDefaults.forEach((name) => { map[name] = true; });
        userOverrides.forEach(({ permission, granted }) => { map[permission] = granted; });
        return map;
    }

    const [checked, setChecked] = useState<Record<string, boolean>>(buildChecked);
    const [saving, setSaving]   = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => { setChecked(buildChecked()); }, [userOverrides, roleDefaults]);

    function buildPayload() {
        const payload: Record<string, boolean | null> = {};
        const allPerms = Object.values(allPermissions).flat().map((p) => p.name);
        allPerms.forEach((name) => {
            const isChecked   = checked[name] ?? false;
            const hadOverride = userOverrides.some((o) => o.permission === name);
            // For platform staff (no role defaults): checked=true → grant, checked=false + had override → null (clear)
            if (isChecked) {
                payload[name] = true;
            } else if (hadOverride) {
                payload[name] = null; // remove override
            }
        });
        return payload;
    }

    function handleSave() {
        setSaving(true);
        router.put(
            `/admin/staff/${staff.id}/permissions`,
            { permissions: buildPayload() },
            {
                preserveScroll: true,
                onSuccess: () => toast.success('Permissions saved.'),
                onFinish: () => setSaving(false),
            }
        );
    }

    function handleClearAll() {
        setClearing(true);
        router.delete(
            `/admin/staff/${staff.id}/permissions`,
            {
                preserveScroll: true,
                onSuccess: () => {
                    setChecked({});
                    toast.success('All permissions cleared.');
                },
                onFinish: () => setClearing(false),
            }
        );
    }

    const groups = Object.entries(allPermissions);
    const grantedCount = Object.values(checked).filter(Boolean).length;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        Permission Manager
                        {grantedCount > 0 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                {grantedCount} granted
                            </span>
                        )}
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleClearAll}
                            disabled={clearing || saving || grantedCount === 0}
                            className="text-gray-600"
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            {clearing ? 'Clearing…' : 'Clear All'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || clearing}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {saving ? 'Saving…' : 'Save Permissions'}
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    Check the pages this staff member can access. Unchecked pages are hidden from them.
                </p>
            </CardHeader>
            <CardContent>
                {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                        No permissions found. Run the database seeder to populate permissions.
                    </p>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {groups.map(([group, perms]) => (
                            <div key={group} className="space-y-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    {group}
                                </h4>
                                {perms.map((perm) => {
                                    const isChecked = checked[perm.name] ?? false;
                                    return (
                                        <label
                                            key={perm.name}
                                            className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-gray-50 transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) =>
                                                    setChecked((prev) => ({ ...prev, [perm.name]: e.target.checked }))
                                                }
                                                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600"
                                            />
                                            <div className="min-w-0">
                                                <p className={`text-xs font-medium leading-tight ${
                                                    isChecked ? 'text-gray-800' : 'text-gray-400'
                                                }`}>
                                                    {perm.name.split('.').pop()?.replace(/_/g, ' ')}
                                                </p>
                                                {perm.description && (
                                                    <p className="text-xs text-gray-400 leading-tight mt-0.5 truncate">
                                                        {perm.description}
                                                    </p>
                                                )}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StaffShow({ staff, allPermissions, roleDefaults, userOverrides, history }: Props) {
    const [showDeactivate, setShowDeactivate] = useState(false);
    const [showArchive, setShowArchive]       = useState(false);

    const deactivateForm = useForm({ reason: '', notes: '' });
    const archiveForm    = useForm({ reason: '', notes: '' });

    function submitDeactivate() {
        deactivateForm.patch(`/admin/staff/${staff.id}/toggle`, {
            preserveScroll: true,
            onSuccess: () => {
                setShowDeactivate(false);
                deactivateForm.reset();
                toast.success(`${staff.name} has been deactivated.`);
            },
        });
    }

    function submitArchive() {
        archiveForm.delete(`/admin/staff/${staff.id}`, {
            onSuccess: () => {
                setShowArchive(false);
                toast.success('Staff account archived.');
            },
        });
    }

    function activate() {
        router.patch(`/admin/staff/${staff.id}/toggle`, {}, {
            preserveScroll: true,
            onSuccess: () => toast.success(`${staff.name} has been activated.`),
        });
    }

    return (
        <AppLayout>
            <Head title={`${staff.name} — Platform Staff`} />

            <div className="p-6 space-y-6">
                {/* Back button */}
                <div>
                    <Button variant="ghost" size="sm" onClick={() => router.visit('/admin/staff')}>
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Back to Platform Staff
                    </Button>
                </div>

                {/* Profile Card */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-2xl font-bold uppercase shrink-0">
                                    {staff.name.charAt(0)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h1 className="text-xl font-bold">{staff.name}</h1>
                                        <Badge
                                            className={staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}
                                        >
                                            {staff.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                                            <Shield className="mr-1 h-3 w-3" />
                                            Platform Staff
                                        </span>
                                        {staff.sub_role ? (
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${POSITION_STYLES[staff.sub_role] ?? 'bg-gray-100 text-gray-600'}`}>
                                                {POSITION_LABELS[staff.sub_role] ?? staff.sub_role}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                                                No position set
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Mail className="h-3.5 w-3.5" />
                                            {staff.email}
                                        </span>
                                        {staff.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="h-3.5 w-3.5" />
                                                {staff.phone}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5" />
                                            Joined {fmtDate(staff.created_at)}
                                        </span>
                                    </div>

                                    {/* Deactivation info banner */}
                                    {!staff.is_active && staff.deactivation_reason && (
                                        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm">
                                            <span className="font-medium text-red-700">Deactivated:</span>{' '}
                                            <span className="text-red-600">{staff.deactivation_reason}</span>
                                            {staff.deactivation_notes && (
                                                <span className="text-red-500 italic"> — "{staff.deactivation_notes}"</span>
                                            )}
                                            {staff.deactivated_at && (
                                                <span className="ml-2 text-xs text-red-400">{staff.deactivated_at}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 sm:shrink-0">
                                {staff.is_active ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setShowDeactivate(true)}
                                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                                    >
                                        <UserX className="mr-1 h-3.5 w-3.5" />Deactivate
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={activate}
                                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                    >
                                        <UserCheck className="mr-1 h-3.5 w-3.5" />Activate
                                    </Button>
                                )}

                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowArchive(true)}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    Archive
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Change Position */}
                <ChangePosition staff={staff} />

                {/* Permission Manager */}
                <PermissionManager
                    staff={staff}
                    allPermissions={allPermissions}
                    roleDefaults={roleDefaults}
                    userOverrides={userOverrides}
                />

                {/* Action History */}
                {history.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4 text-gray-400" />
                                Account Action History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ol className="relative border-l border-gray-200 pl-5 space-y-4">
                                {history.map((item) => {
                                    const meta = ACTION_LABELS[item.action] ?? { label: item.action, color: 'bg-gray-100 text-gray-700' };
                                    return (
                                        <li key={item.id} className="relative">
                                            <span className="absolute -left-[1.3125rem] flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-white bg-gray-300" />
                                            <div className="flex items-start justify-between gap-2 flex-wrap">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                                                            {meta.label}
                                                        </span>
                                                        {item.reason && (
                                                            <span className="text-sm text-gray-700">{item.reason}</span>
                                                        )}
                                                    </div>
                                                    {item.notes && (
                                                        <p className="mt-0.5 text-xs text-gray-500 italic">"{item.notes}"</p>
                                                    )}
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        by {item.performed_by}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.created_at}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Deactivate dialog */}
            <AlertDialog open={showDeactivate} onOpenChange={(o) => { if (!o) { setShowDeactivate(false); deactivateForm.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate {staff.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Their account will be locked. Provide a reason for this action.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
                            <select
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            <label className="text-sm font-medium text-gray-700">Additional notes <span className="text-gray-400">(optional)</span></label>
                            <textarea
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                placeholder="Provide more context if needed…"
                                value={deactivateForm.data.notes}
                                onChange={(e) => deactivateForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitDeactivate}
                            disabled={!deactivateForm.data.reason || deactivateForm.processing}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {deactivateForm.processing ? 'Deactivating…' : 'Deactivate Account'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Archive dialog */}
            <AlertDialog open={showArchive} onOpenChange={(o) => { if (!o) { setShowArchive(false); archiveForm.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archive {staff.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will revoke their admin panel access permanently (restorable). Provide a reason.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
                            <select
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={archiveForm.data.reason}
                                onChange={(e) => archiveForm.setData('reason', e.target.value)}
                            >
                                <option value="">Select a reason…</option>
                                {DEACTIVATE_REASONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium text-gray-700">Additional notes <span className="text-gray-400">(optional)</span></label>
                            <textarea
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                placeholder="Provide more context if needed…"
                                value={archiveForm.data.notes}
                                onChange={(e) => archiveForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitArchive}
                            disabled={!archiveForm.data.reason || archiveForm.processing}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {archiveForm.processing ? 'Archiving…' : 'Archive Account'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
