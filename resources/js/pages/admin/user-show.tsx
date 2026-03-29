import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    BadgeCheck,
    Calendar,
    Mail,
    Phone,
    ShoppingCart,
    Store,
    UserX,
} from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { fmtDate, fmtStatus } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserDetail {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    sub_role: string | null;
    is_active: boolean;
    id_verified: boolean;
    valid_id: string | null;
    created_at: string;
    deleted_at: string | null;
    order_count: number;
}

interface StoreInfo {
    id: number;
    store_name: string;
    status: string;
    city: string | null;
}

interface OrderRow {
    id: number;
    order_number: string;
    status: string;
    total_amount: number;
    created_at: string;
}

interface Props {
    user: UserDetail;
    store: StoreInfo | null;
    orders: OrderRow[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLORS: Record<string, string> = {
    pending:          'bg-yellow-100 text-yellow-800',
    confirmed:        'bg-blue-100 text-blue-800',
    preparing:        'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:        'bg-green-100 text-green-800',
    cancelled:        'bg-red-100 text-red-800',
};

const PLATFORM_ROLES = ['platform_admin', 'admin', 'manager', 'cashier', 'warehouse', 'rider'];

function RoleBadge({ user }: { user: UserDetail }) {
    const parts: { label: string; cls: string }[] = [];

    if (user.role === 'customer') {
        parts.push({ label: 'Buyer', cls: 'bg-blue-100 text-blue-700' });
    } else if (user.role === 'seller') {
        parts.push({ label: 'Seller', cls: 'bg-emerald-100 text-emerald-700' });
    } else if (user.role === 'seller_staff') {
        parts.push({ label: user.sub_role ? `Staff · ${user.sub_role}` : 'Seller Staff', cls: 'bg-teal-100 text-teal-700' });
    } else if (user.role === 'platform_staff') {
        parts.push({ label: user.sub_role ? `Platform Staff · ${user.sub_role}` : 'Platform Staff', cls: 'bg-violet-100 text-violet-700' });
    } else if (PLATFORM_ROLES.includes(user.role)) {
        parts.push({ label: user.role.replace('_', ' '), cls: 'bg-purple-100 text-purple-700 capitalize' });
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {parts.map((p, i) => (
                <span key={i} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${p.cls}`}>
                    {p.label}
                </span>
            ))}
        </div>
    );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function UserShow({ user, store, orders }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Users', href: '/admin/users' },
        { title: user.name, href: `/admin/users/${user.id}` },
    ];

    const isPlatformAdmin = ['platform_admin', 'admin'].includes(user.role);

    const [showDeactivate, setShowDeactivate] = useState(false);
    const [showArchive, setShowArchive]       = useState(false);

    const deactivateForm = useForm({ reason: '', notes: '' });
    const archiveForm    = useForm({ reason: '', notes: '' });

    function activateUser() {
        router.patch(`/admin/users/${user.id}/toggle-active`, {}, { preserveScroll: true });
    }

    function submitDeactivate() {
        deactivateForm.patch(`/admin/users/${user.id}/toggle-active`, {
            preserveScroll: true,
            onSuccess: () => { setShowDeactivate(false); deactivateForm.reset(); },
        });
    }

    function submitArchive() {
        archiveForm.delete(`/admin/users/${user.id}`, {
            onSuccess: () => { setShowArchive(false); archiveForm.reset(); },
        });
    }

    function restoreUser() {
        router.post(`/admin/users/${user.id}/restore`, {}, { preserveScroll: true });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={user.name} />

            <div className="p-6 space-y-6">
                <div>
                    <Link href="/admin/users"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Users
                    </Link>
                </div>

                {/* User header */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold">{user.name}</h1>
                                    {user.deleted_at ? (
                                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Archived</span>
                                    ) : user.is_active ? (
                                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Inactive</span>
                                    )}
                                </div>
                                <RoleBadge user={user} />

                                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-3">
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="h-4 w-4" /> {user.email}
                                    </span>
                                    {user.phone && (
                                        <span className="flex items-center gap-1.5">
                                            <Phone className="h-4 w-4" /> {user.phone}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="h-4 w-4" /> Joined {fmtDate(user.created_at)}
                                    </span>
                                    {user.id_verified && (
                                        <span className="flex items-center gap-1.5 text-emerald-600">
                                            <BadgeCheck className="h-4 w-4" /> ID Verified
                                        </span>
                                    )}
                                    {user.role === 'customer' && (
                                        <span className="flex items-center gap-1.5">
                                            <ShoppingCart className="h-4 w-4" /> {user.order_count} order{user.order_count !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            {!isPlatformAdmin && (
                                <div className="flex flex-wrap gap-2">
                                    {user.deleted_at ? (
                                        <Button size="sm" variant="outline" onClick={restoreUser}>Restore Account</Button>
                                    ) : (
                                        <>
                                            {user.is_active ? (
                                                <Button size="sm" variant="outline" onClick={() => setShowDeactivate(true)}>
                                                    Deactivate
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="default" onClick={activateUser}>
                                                    Activate
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => setShowArchive(true)}
                                            >
                                                <UserX className="h-3.5 w-3.5 mr-1" />
                                                Archive
                                            </Button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Store info (sellers) */}
                {store && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Store className="h-4 w-4 text-emerald-500" />
                                Store
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <p className="font-semibold">{store.store_name}</p>
                                    <p className="text-sm text-muted-foreground">{store.city ?? '—'}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        store.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                                        : store.status === 'pending'  ? 'bg-yellow-100 text-yellow-700'
                                        : store.status === 'rejected' ? 'bg-red-100 text-red-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {fmtStatus(store.status)}
                                    </span>
                                    <Link href={`/admin/stores/${store.id}`} className="text-xs text-primary hover:underline">
                                        View Store →
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Order history (buyers) */}
                {user.role === 'customer' && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4 text-blue-500" />
                                Recent Orders
                                <span className="text-xs font-normal text-muted-foreground">({user.order_count} total)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {orders.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">No orders yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-muted-foreground">
                                                <th className="pb-2 font-medium">Order</th>
                                                <th className="pb-2 font-medium">Status</th>
                                                <th className="pb-2 font-medium text-right">Amount</th>
                                                <th className="pb-2 font-medium">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {orders.map((o) => (
                                                <tr key={o.id} className="hover:bg-muted/30">
                                                    <td className="py-2 font-mono text-xs">{o.order_number}</td>
                                                    <td className="py-2">
                                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                                            {o.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 text-right font-medium">{fmt(o.total_amount)}</td>
                                                    <td className="py-2 text-muted-foreground">{fmtDate(o.created_at)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Deactivate dialog */}
            <Dialog open={showDeactivate} onOpenChange={(o) => { if (!o) { setShowDeactivate(false); deactivateForm.reset(); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Deactivate {user.name}?
                        </DialogTitle>
                        <DialogDescription>
                            The user will be blocked from logging in. You can reactivate them at any time.
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
                        <Button variant="outline" onClick={() => { setShowDeactivate(false); deactivateForm.reset(); }}>
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

            {/* Archive dialog */}
            <Dialog open={showArchive} onOpenChange={(o) => { if (!o) { setShowArchive(false); archiveForm.reset(); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserX className="h-4 w-4 text-red-500" />
                            Archive {user.name}?
                        </DialogTitle>
                        <DialogDescription>
                            This will soft-delete the user. They can be restored later.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="grid gap-1.5">
                            <Label>Reason <span className="text-red-500">*</span></Label>
                            <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <textarea
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                rows={3}
                                placeholder="Additional context…"
                                value={archiveForm.data.notes}
                                onChange={(e) => archiveForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowArchive(false); archiveForm.reset(); }}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={!archiveForm.data.reason || archiveForm.processing}
                            onClick={submitArchive}
                        >
                            {archiveForm.processing ? 'Archiving…' : 'Archive'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
