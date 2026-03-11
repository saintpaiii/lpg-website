import { Head, router } from '@inertiajs/react';
import { toast } from 'sonner';
import AppLayout from '@/layouts/app-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    ArrowLeft,
    Truck,
    CheckCircle,
    XCircle,
    TrendingUp,
    Activity,
    Phone,
    Mail,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Shield,
    RotateCcw,
    Save,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Staff {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
    today_deliveries: number;
}

interface Stats {
    total: number;
    delivered: number;
    failed: number;
    active: number;
    success_rate: number;
    this_month: number;
    this_month_delivered: number;
}

interface DeliveryOrder {
    id: number;
    order_number: string;
    total_amount: number;
    customer: string | null;
}

interface Delivery {
    id: number;
    status: string;
    notes: string | null;
    assigned_at: string | null;
    delivered_at: string | null;
    order: DeliveryOrder | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

interface MonthlyData {
    month: string;
    total: number;
    delivered: number;
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
    staff: Staff;
    stats: Stats;
    deliveries: Paginated<Delivery>;
    monthlyData: MonthlyData[];
    allPermissions: Record<string, PermDef[]>;
    roleDefaults: string[];
    userOverrides: UserOverride[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string }> = {
    assigned:   { label: 'Assigned'   },
    picked_up:  { label: 'Picked Up'  },
    in_transit: { label: 'In Transit' },
    delivered:  { label: 'Delivered'  },
    failed:     { label: 'Failed'     },
};

function StatusBadge({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        assigned:   'bg-yellow-100 text-yellow-800',
        picked_up:  'bg-blue-100 text-blue-800',
        in_transit: 'bg-indigo-100 text-indigo-800',
        delivered:  'bg-green-100 text-green-800',
        failed:     'bg-red-100 text-red-800',
    };
    const cfg = STATUS_CONFIG[status] ?? { label: status };
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-gray-100 text-gray-800'}`}>
            {cfg.label}
        </span>
    );
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

// ── Custom Tooltip for Chart ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
            <p className="font-semibold mb-1">{label}</p>
            {payload.map((p) => (
                <p key={p.name} style={{ color: p.color }}>
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
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
    // Build effective permission state: name → boolean
    function buildEffective() {
        const map: Record<string, boolean> = {};
        roleDefaults.forEach((name) => { map[name] = true; });
        userOverrides.forEach(({ permission, granted }) => { map[permission] = granted; });
        return map;
    }

    const [checked, setChecked] = useState<Record<string, boolean>>(buildEffective);
    const [saving, setSaving]   = useState(false);
    const [resetting, setResetting] = useState(false);

    // Re-sync when server returns updated props (after save/reset)
    useEffect(() => {
        setChecked(buildEffective());
    }, [userOverrides, roleDefaults]);

    // Build the overrides payload (only send what differs from role defaults OR has an existing override)
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
                // Same as role default but override existed → clear override
                payload[name] = null;
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

    function handleReset() {
        setResetting(true);
        router.delete(
            `/admin/staff/${staff.id}/permissions`,
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
                            Role: <span className="capitalize font-medium">{staff.role}</span>
                        </span>
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleReset}
                            disabled={resetting || saving}
                            className="text-gray-600"
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            {resetting ? 'Resetting…' : 'Reset to Role Defaults'}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || resetting}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
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
                    <p className="text-sm text-muted-foreground text-center py-6">
                        No permissions found. Run the database seeder to populate permissions.
                    </p>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {groups.map(([group, perms]) => {
                            const overriddenInGroup = perms.some((p) =>
                                userOverrides.some((o) => o.permission === p.name)
                            );
                            return (
                                <div key={group} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            {group}
                                        </h4>
                                        {overriddenInGroup && (
                                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-600 font-medium">
                                                overridden
                                            </span>
                                        )}
                                    </div>
                                    {perms.map((perm) => {
                                        const isChecked   = checked[perm.name] ?? false;
                                        const isDefault   = roleDefaults.includes(perm.name);
                                        const isDifferent = isChecked !== isDefault;

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
                                                        isDifferent ? 'text-purple-700' : isChecked ? 'text-gray-800' : 'text-gray-400'
                                                    }`}>
                                                        {perm.name.split('.').pop()?.replace(/_/g, ' ')}
                                                        {isDifferent && (
                                                            <span className="ml-1 text-purple-500">★</span>
                                                        )}
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
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StaffShow({
    staff,
    stats,
    deliveries,
    monthlyData,
    allPermissions,
    roleDefaults,
    userOverrides,
}: Props) {
    const successRateColor =
        stats.success_rate >= 90 ? 'text-green-600' :
        stats.success_rate >= 70 ? 'text-yellow-600' :
        'text-red-600';

    const ROLE_STYLES: Record<string, string> = {
        manager:   'bg-purple-100 text-purple-700',
        cashier:   'bg-emerald-100 text-emerald-700',
        warehouse: 'bg-amber-100 text-amber-700',
        rider:     'bg-blue-100 text-blue-700',
    };

    return (
        <AppLayout>
            <Head title={`${staff.name} — Staff Profile`} />

            <div className="p-6 space-y-6">
                {/* Back button */}
                <div>
                    <Button variant="ghost" size="sm" onClick={() => router.visit('/admin/staff')}>
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Back to Staff
                    </Button>
                </div>

                {/* Profile Card */}
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
                                        <Badge
                                            className={staff.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}
                                        >
                                            {staff.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[staff.role] ?? 'bg-gray-100 text-gray-600'}`}>
                                            {staff.role}
                                        </span>
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
                                            Joined {staff.created_at}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {stats.active > 0 && (
                                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-blue-700 border border-blue-200">
                                    <Truck className="h-4 w-4" />
                                    <span className="font-semibold">{stats.active}</span>
                                    <span className="text-sm">active delivery{stats.active !== 1 ? 'ies' : ''}</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Deliveries</p>
                                    <p className="text-3xl font-bold mt-1">{stats.total}</p>
                                </div>
                                <Truck className="h-8 w-8 text-blue-500 opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Delivered</p>
                                    <p className="text-3xl font-bold mt-1 text-green-600">{stats.delivered}</p>
                                </div>
                                <CheckCircle className="h-8 w-8 text-green-500 opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed</p>
                                    <p className="text-3xl font-bold mt-1 text-red-600">{stats.failed}</p>
                                </div>
                                <XCircle className="h-8 w-8 text-red-500 opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Success Rate</p>
                                    <p className={`text-3xl font-bold mt-1 ${successRateColor}`}>
                                        {stats.success_rate}%
                                    </p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-indigo-500 opacity-70" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Permission Manager */}
                <PermissionManager
                    staff={staff}
                    allPermissions={allPermissions}
                    roleDefaults={roleDefaults}
                    userOverrides={userOverrides}
                />

                {/* This Month + Chart Row */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Activity className="h-4 w-4 text-blue-500" />
                                This Month
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-muted-foreground">Total Assigned</span>
                                <span className="font-semibold">{stats.this_month}</span>
                            </div>
                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-muted-foreground">Delivered</span>
                                <span className="font-semibold text-green-600">{stats.this_month_delivered}</span>
                            </div>
                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-muted-foreground">Failed / Pending</span>
                                <span className="font-semibold text-red-600">
                                    {stats.this_month - stats.this_month_delivered}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Monthly Rate</span>
                                <span className={`font-semibold ${
                                    stats.this_month > 0
                                        ? Math.round((stats.this_month_delivered / stats.this_month) * 100) >= 90
                                            ? 'text-green-600'
                                            : Math.round((stats.this_month_delivered / stats.this_month) * 100) >= 70
                                                ? 'text-yellow-600'
                                                : 'text-red-600'
                                        : 'text-muted-foreground'
                                }`}>
                                    {stats.this_month > 0
                                        ? `${Math.round((stats.this_month_delivered / stats.this_month) * 100)}%`
                                        : '—'}
                                </span>
                            </div>
                            {stats.this_month > 0 && (
                                <div className="mt-2">
                                    <div className="h-2 w-full rounded-full bg-gray-100">
                                        <div
                                            className="h-2 rounded-full bg-green-500 transition-all"
                                            style={{ width: `${Math.round((stats.this_month_delivered / stats.this_month) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground text-right">
                                        {stats.this_month_delivered} of {stats.this_month} delivered
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                                Monthly Delivery History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {monthlyData.length === 0 ? (
                                <div className="flex h-48 items-center justify-center text-muted-foreground text-sm">
                                    No delivery data yet
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="total" name="Total" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="delivered" name="Delivered" fill="#22c55e" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Delivery History Table */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4 text-blue-500" />
                                Delivery History
                            </CardTitle>
                            <span className="text-sm text-muted-foreground">{deliveries.total} total</span>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {deliveries.data.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Truck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                <p className="text-muted-foreground">No deliveries found</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                <th className="px-4 py-3">Order #</th>
                                                <th className="px-4 py-3">Customer</th>
                                                <th className="px-4 py-3">Amount</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Assigned</th>
                                                <th className="px-4 py-3">Delivered</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {deliveries.data.map((d) => (
                                                <tr key={d.id} className="hover:bg-gray-50/60">
                                                    <td className="px-4 py-3 font-mono text-sm">
                                                        {d.order?.order_number ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {d.order?.customer ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {d.order ? formatCurrency(d.order.total_amount) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={d.status} />
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {d.assigned_at ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {d.delivered_at ?? '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {deliveries.last_page > 1 && (
                                    <div className="flex items-center justify-between border-t px-4 py-3">
                                        <p className="text-sm text-muted-foreground">
                                            Showing {deliveries.from}–{deliveries.to} of {deliveries.total}
                                        </p>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="outline" size="sm"
                                                disabled={deliveries.current_page === 1}
                                                onClick={() =>
                                                    router.get(`/admin/staff/${staff.id}`, { page: deliveries.current_page - 1 }, { preserveScroll: true })
                                                }
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline" size="sm"
                                                disabled={deliveries.current_page === deliveries.last_page}
                                                onClick={() =>
                                                    router.get(`/admin/staff/${staff.id}`, { page: deliveries.current_page + 1 }, { preserveScroll: true })
                                                }
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
