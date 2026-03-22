import { Head, Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, Building2, CheckCircle2, Eye, MoreHorizontal, PauseCircle, Search, Store, Trash2, XCircle } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const SUSPEND_REASONS = [
    'Policy violation',
    'Fraudulent activity',
    'Customer complaints',
    'Failure to fulfill orders',
    'Unauthorized products',
    'Misrepresentation',
    'Payment issues',
    'Other',
];

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/admin/dashboard' },
    { title: 'Stores',    href: '/admin/stores' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type StoreRow = {
    id: number;
    store_name: string;
    city: string;
    province: string;
    status: string;
    commission_rate: number;
    created_at: string;
    deleted_at: string | null;
    owner_name: string;
    owner_email: string;
};

type Counts = { pending: number; approved: number; rejected: number; suspended: number; archived: number };
type PaginatedStores = { data: StoreRow[]; current_page: number; last_page: number; total: number };

type Props = {
    stores: PaginatedStores;
    counts: Counts;
    tab: string;
    search: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved:  'bg-green-100 text-green-800 border-green-200',
    rejected:  'bg-red-100 text-red-800 border-red-200',
    suspended: 'bg-orange-100 text-orange-800 border-orange-200',
};

const TABS = [
    { key: 'pending',   label: 'Pending',   count_key: 'pending'   },
    { key: 'approved',  label: 'Approved',  count_key: 'approved'  },
    { key: 'rejected',  label: 'Rejected',  count_key: 'rejected'  },
    { key: 'suspended', label: 'Suspended', count_key: 'suspended' },
    { key: 'archived',  label: 'Archived',  count_key: 'archived'  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Stores({ stores, counts, tab, search }: Props) {
    const [searchVal, setSearchVal] = useState(search);
    const [rejectTarget, setRejectTarget]   = useState<StoreRow | null>(null);
    const [destroyTarget, setDestroyTarget] = useState<StoreRow | null>(null);
    const [forceTarget, setForceTarget]     = useState<StoreRow | null>(null);
    const [suspendTarget, setSuspendTarget] = useState<StoreRow | null>(null);

    const { data: rejectData, setData: setRejectData, patch: patchReject, processing: rejecting, reset: resetReject } = useForm({ reason: '' });
    const suspendForm = useForm({ reason: '', notes: '' });

    function goTab(t: string) {
        router.get('/admin/stores', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/stores', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    function approve(store: StoreRow) {
        router.patch(`/admin/stores/${store.id}/approve`, {}, {
            onSuccess: () => {},
        });
    }

    function suspend(store: StoreRow) {
        setSuspendTarget(store);
    }

    function submitSuspend() {
        if (!suspendTarget) return;
        suspendForm.patch(`/admin/stores/${suspendTarget.id}/suspend`, {
            onSuccess: () => { setSuspendTarget(null); suspendForm.reset(); },
        });
    }

    function unsuspend(store: StoreRow) {
        router.patch(`/admin/stores/${store.id}/unsuspend`);
    }

    function restore(store: StoreRow) {
        router.post(`/admin/stores/${store.id}/restore`);
    }

    function submitReject() {
        patchReject(`/admin/stores/${rejectTarget?.id}/reject`, {
            onSuccess: () => { setRejectTarget(null); resetReject(); },
        });
    }

    function submitDestroy() {
        router.delete(`/admin/stores/${destroyTarget?.id}`, {
            onSuccess: () => setDestroyTarget(null),
        });
    }

    function submitForce() {
        router.delete(`/admin/stores/${forceTarget?.id}/force`, {
            onSuccess: () => setForceTarget(null),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Stores" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Store className="h-6 w-6 text-blue-600" />
                            Store Management
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Review and manage seller stores on the platform.
                        </p>
                    </div>
                    <form onSubmit={doSearch} className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search stores…"
                                className="pl-9 w-56"
                                value={searchVal}
                                onChange={(e) => setSearchVal(e.target.value)}
                            />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">Search</Button>
                    </form>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                    {TABS.map(({ key, label, count_key }) => (
                        <button
                            key={key}
                            onClick={() => goTab(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === key
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {label}
                            {counts[count_key] > 0 && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                                    tab === key ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                                }`}>
                                    {counts[count_key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Table */}
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Store</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Location</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Owner</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Commission</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Joined</th>
                                        <th className="px-4 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {stores.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-12 text-muted-foreground">
                                                No stores in this category.
                                            </td>
                                        </tr>
                                    ) : stores.data.map((store) => (
                                        <tr key={store.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                                                        <Building2 className="h-4 w-4 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <Link href={`/admin/stores/${store.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-blue-600">
                                                            {store.store_name}
                                                        </Link>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                                                {store.city}, {store.province}
                                            </td>
                                            <td className="px-4 py-3 hidden lg:table-cell">
                                                <p className="font-medium text-sm">{store.owner_name}</p>
                                                <p className="text-xs text-muted-foreground">{store.owner_email}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                                                    {store.commission_rate}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[store.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                                    {store.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground text-xs hidden sm:table-cell">
                                                {store.deleted_at ?? store.created_at}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/admin/stores/${store.id}`} className="flex items-center gap-2">
                                                                <Eye className="h-4 w-4" /> View Details
                                                            </Link>
                                                        </DropdownMenuItem>

                                                        {tab === 'pending' && <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => approve(store)} className="text-green-600 flex items-center gap-2">
                                                                <CheckCircle2 className="h-4 w-4" /> Approve
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setRejectTarget(store)} className="text-red-600 flex items-center gap-2">
                                                                <XCircle className="h-4 w-4" /> Reject
                                                            </DropdownMenuItem>
                                                        </>}

                                                        {tab === 'approved' && <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => suspend(store)} className="text-orange-600 flex items-center gap-2">
                                                                <PauseCircle className="h-4 w-4" /> Suspend
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setDestroyTarget(store)} className="text-red-600 flex items-center gap-2">
                                                                <Trash2 className="h-4 w-4" /> Archive
                                                            </DropdownMenuItem>
                                                        </>}

                                                        {tab === 'suspended' && <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => unsuspend(store)} className="text-green-600 flex items-center gap-2">
                                                                <CheckCircle2 className="h-4 w-4" /> Reinstate
                                                            </DropdownMenuItem>
                                                        </>}

                                                        {tab === 'archived' && <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => restore(store)} className="text-green-600 flex items-center gap-2">
                                                                <CheckCircle2 className="h-4 w-4" /> Restore
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setForceTarget(store)} className="text-red-600 flex items-center gap-2">
                                                                <Trash2 className="h-4 w-4" /> Delete Permanently
                                                            </DropdownMenuItem>
                                                        </>}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        {stores.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{stores.total} stores</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: stores.last_page }, (_, i) => i + 1).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => router.get('/admin/stores', { tab, search: searchVal, page: p })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${p === stores.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Reject dialog */}
            <AlertDialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); resetReject(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Store Application</AlertDialogTitle>
                        <AlertDialogDescription>
                            Provide a reason for rejecting <strong>{rejectTarget?.store_name}</strong>. This will be recorded on the verification request.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <textarea
                        className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Reason for rejection…"
                        value={rejectData.reason}
                        onChange={(e) => setRejectData('reason', e.target.value)}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitReject}
                            disabled={!rejectData.reason.trim() || rejecting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Reject Store
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Archive dialog */}
            <AlertDialog open={!!destroyTarget} onOpenChange={(o) => { if (!o) setDestroyTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Archive Store</AlertDialogTitle>
                        <AlertDialogDescription>
                            Archive <strong>{destroyTarget?.store_name}</strong>? It can be restored later.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitDestroy} className="bg-red-600 hover:bg-red-700">Archive</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Force delete dialog */}
            <AlertDialog open={!!forceTarget} onOpenChange={(o) => { if (!o) setForceTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Permanently Delete Store</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete <strong>{forceTarget?.store_name}</strong> and cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitForce} className="bg-red-600 hover:bg-red-700">Delete Permanently</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Suspend dialog */}
            <Dialog open={!!suspendTarget} onOpenChange={(o) => { if (!o) { setSuspendTarget(null); suspendForm.reset(); } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            Suspend Store
                        </DialogTitle>
                        <DialogDescription>
                            Suspend <strong>{suspendTarget?.store_name}</strong>? The seller will be blocked from the platform.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="grid gap-1.5">
                            <Label>Reason <span className="text-red-500">*</span></Label>
                            <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                value={suspendForm.data.reason}
                                onChange={(e) => suspendForm.setData('reason', e.target.value)}
                            >
                                <option value="">Select a reason…</option>
                                {SUSPEND_REASONS.map((r) => (
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
                                value={suspendForm.data.notes}
                                onChange={(e) => suspendForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setSuspendTarget(null); suspendForm.reset(); }}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            disabled={!suspendForm.data.reason || suspendForm.processing}
                            onClick={submitSuspend}
                        >
                            {suspendForm.processing ? 'Suspending…' : 'Suspend Store'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
