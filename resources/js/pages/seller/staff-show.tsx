import { Head, router } from '@inertiajs/react';
import { toast } from 'sonner';
import AppLayout from '@/layouts/app-layout';
import { fmtDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    Calendar,
    Mail,
    Phone,
    RotateCcw,
    Save,
    Shield,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BreadcrumbItem } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMember {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    sub_role: string;
    is_active: boolean;
    created_at: string;
}

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
    staff: StaffMember;
    allPermissions: Record<string, PermDef[]>;
    roleDefaults: string[];
    userOverrides: UserOverride[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_ROLE_STYLES: Record<string, string> = {
    cashier:   'bg-emerald-100 text-emerald-700',
    warehouse: 'bg-amber-100 text-amber-700',
    rider:     'bg-blue-100 text-blue-700',
};

const SUB_ROLE_LABELS: Record<string, string> = {
    cashier:   'Cashier',
    warehouse: 'Warehouse',
    rider:     'Rider',
};

// ── Permission Manager ────────────────────────────────────────────────────────

function PermissionManager({
    staff,
    allPermissions,
    roleDefaults,
    userOverrides,
}: {
    staff: StaffMember;
    allPermissions: Record<string, PermDef[]>;
    roleDefaults: string[];
    userOverrides: UserOverride[];
}) {
    function buildEffective() {
        const map: Record<string, boolean> = {};
        roleDefaults.forEach((name) => { map[name] = true; });
        userOverrides.forEach(({ permission, granted }) => { map[permission] = granted; });
        return map;
    }

    const [checked, setChecked] = useState<Record<string, boolean>>(buildEffective);
    const [saving, setSaving]   = useState(false);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        setChecked(buildEffective());
    }, [userOverrides, roleDefaults]);

    function buildPayload() {
        const payload: Record<string, boolean | null> = {};
        const allPerms = Object.values(allPermissions).flat().map((p) => p.name);
        allPerms.forEach((name) => {
            const currentHas  = checked[name] ?? false;
            const roleHas     = roleDefaults.includes(name);
            const hasOverride = userOverrides.some((o) => o.permission === name);
            if (currentHas !== roleHas) {
                payload[name] = currentHas;
            } else if (hasOverride) {
                payload[name] = null;
            }
        });
        return payload;
    }

    function handleSave() {
        setSaving(true);
        router.put(
            `/seller/staff/${staff.id}/permissions`,
            { permissions: buildPayload() },
            {
                preserveScroll: true,
                onSuccess: () => toast.success('Permissions saved.'),
                onFinish: () => setSaving(false),
            }
        );
    }

    function handleReset() {
        setResetting(true);
        router.delete(
            `/seller/staff/${staff.id}/permissions`,
            {
                preserveScroll: true,
                onSuccess: () => {
                    setChecked(Object.fromEntries(roleDefaults.map((n) => [n, true])));
                    toast.success('Permissions reset to role defaults.');
                },
                onFinish: () => setResetting(false),
            }
        );
    }

    const groups = Object.entries(allPermissions);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-500" />
                        Permission Manager
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                            Role: <span className="capitalize font-medium">{SUB_ROLE_LABELS[staff.sub_role] ?? staff.sub_role}</span>
                        </span>
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={handleReset} disabled={resetting || saving} className="text-gray-600">
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            {resetting ? 'Resetting…' : 'Reset to Role Defaults'}
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || resetting} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            {saving ? 'Saving…' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    Customize this staff member's permissions. Checkmarks in{' '}
                    <span className="text-blue-600 font-medium">blue</span> are role defaults;{' '}
                    <span className="text-purple-600 font-medium">purple ★</span> marks differ from role defaults.
                </p>
            </CardHeader>
            <CardContent>
                {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No permissions found.</p>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {groups.map(([group, perms]) => {
                            const overriddenInGroup = perms.some((p) =>
                                userOverrides.some((o) => o.permission === p.name)
                            );
                            return (
                                <div key={group} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{group}</h4>
                                        {overriddenInGroup && (
                                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-600 font-medium">overridden</span>
                                        )}
                                    </div>
                                    {perms.map((perm) => {
                                        const isChecked   = checked[perm.name] ?? false;
                                        const isDefault   = roleDefaults.includes(perm.name);
                                        const isDifferent = isChecked !== isDefault;
                                        return (
                                            <label key={perm.name} className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-gray-50 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => setChecked((prev) => ({ ...prev, [perm.name]: e.target.checked }))}
                                                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600"
                                                />
                                                <div className="min-w-0">
                                                    <p className={`text-xs font-medium leading-tight ${
                                                        isDifferent ? 'text-purple-700' : isChecked ? 'text-gray-800' : 'text-gray-400'
                                                    }`}>
                                                        {perm.name.split('.').pop()?.replace(/_/g, ' ')}
                                                        {isDifferent && <span className="ml-1 text-purple-500">★</span>}
                                                    </p>
                                                    {perm.description && (
                                                        <p className="text-xs text-gray-400 leading-tight mt-0.5 truncate">{perm.description}</p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SellerStaffShow({ staff, allPermissions, roleDefaults, userOverrides }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/seller/dashboard' },
        { title: 'Staff', href: '/seller/staff' },
        { title: staff.name, href: `/seller/staff/${staff.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${staff.name} — Staff`} />

            <div className="p-6 space-y-6 max-w-5xl">
                {/* Back */}
                <Button variant="ghost" size="sm" onClick={() => router.visit('/seller/staff')}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Back to Staff
                </Button>

                {/* Profile */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-2xl font-bold uppercase shrink-0">
                                    {staff.name.charAt(0)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h1 className="text-xl font-bold">{staff.name}</h1>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${staff.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {staff.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SUB_ROLE_STYLES[staff.sub_role] ?? 'bg-gray-100 text-gray-600'}`}>
                                            {SUB_ROLE_LABELS[staff.sub_role] ?? staff.sub_role}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{staff.email}</span>
                                        {staff.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{staff.phone}</span>}
                                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Joined {fmtDate(staff.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Permission Manager */}
                <PermissionManager
                    staff={staff}
                    allPermissions={allPermissions}
                    roleDefaults={roleDefaults}
                    userOverrides={userOverrides}
                />
            </div>
        </AppLayout>
    );
}
