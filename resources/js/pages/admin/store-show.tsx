import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    BadgeCheck,
    Building2,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    Mail,
    MapPin,
    Package,
    PauseCircle,
    Phone,
    PhilippinePeso,
    ShoppingCart,
    XCircle,
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
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { formatAddress } from '@/data/cavite-locations';

// ── Types ─────────────────────────────────────────────────────────────────────

type StoreDetail = {
    id: number;
    store_name: string;
    description: string | null;
    address: string;
    city: string;
    barangay: string | null;
    province: string;
    phone: string | null;
    email: string | null;
    status: string;
    commission_rate: number;
    approved_at: string | null;
    created_at: string;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    owner_id_verified: boolean;
    approved_by_name: string | null;
    valid_id_url: string | null;
    bir_permit_url: string | null;
    business_permit_url: string | null;
    fsic_permit_url: string | null;
    doe_lpg_license_url: string | null;
    lto_permit_url: string | null;
    terms_agreed_at: string | null;
    suspension_reason: string | null;
    suspension_notes: string | null;
    suspended_at: string | null;
};

type ActionHistory = {
    id: number;
    action: string;
    reason: string | null;
    notes: string | null;
    performed_by: string;
    created_at: string;
};

const SUSPEND_REASONS = [
    'Policy Violation',
    'Fraudulent Activity',
    'Pending Investigation',
    'Customer Complaints',
    'Account Inactivity',
    'Non-payment of Commissions',
    'Failed Compliance Check',
    'Other',
];

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    approve:   { label: 'Approved',     color: 'bg-green-100 text-green-700'   },
    reject:    { label: 'Rejected',     color: 'bg-red-100 text-red-700'       },
    suspend:   { label: 'Suspended',    color: 'bg-orange-100 text-orange-700' },
    unsuspend: { label: 'Reinstated',   color: 'bg-blue-100 text-blue-700'     },
    archive:   { label: 'Archived',     color: 'bg-gray-100 text-gray-700'     },
    restore:   { label: 'Restored',     color: 'bg-teal-100 text-teal-700'     },
};

type StoreStats = {
    total_orders: number;
    total_revenue: number;
    total_products: number;
    active_products: number;
    commissions: number;
};

type Props = {
    store: StoreDetail;
    stats: StoreStats;
    history: ActionHistory[];
};

const STATUS_BADGE: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved:  'bg-green-100 text-green-800 border-green-200',
    rejected:  'bg-red-100 text-red-800 border-red-200',
    suspended: 'bg-orange-100 text-orange-800 border-orange-200',
};

function fmt(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DocLink({ url, label }: { url: string | null; label: string }) {
    if (!url) return <span className="text-sm text-muted-foreground">Not uploaded</span>;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
        >
            <FileText className="h-4 w-4" />
            {label}
            <ExternalLink className="h-3 w-3" />
        </a>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoreShow({ store, stats, history }: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/admin/dashboard' },
        { title: 'Stores',    href: '/admin/stores' },
        { title: store.store_name, href: `/admin/stores/${store.id}` },
    ];

    const [showReject, setShowReject]   = useState(false);
    const [showSuspend, setShowSuspend] = useState(false);

    const rejectForm = useForm({ reason: '' });

    const suspendForm = useForm({ reason: '', notes: '' });

    const {
        data: commData,
        setData: setCommData,
        patch: patchComm,
        processing: commProcessing,
    } = useForm({ commission_rate: String(store.commission_rate) });

    function approve() {
        router.patch(`/admin/stores/${store.id}/approve`);
    }

    function submitReject() {
        rejectForm.patch(`/admin/stores/${store.id}/reject`, {
            onSuccess: () => { setShowReject(false); rejectForm.reset(); },
        });
    }

    function submitSuspend() {
        suspendForm.patch(`/admin/stores/${store.id}/suspend`, {
            onSuccess: () => { setShowSuspend(false); suspendForm.reset(); },
        });
    }

    function unsuspend() {
        router.patch(`/admin/stores/${store.id}/unsuspend`);
    }

    const statItems = [
        { label: 'Total Orders',    value: stats.total_orders,    icon: ShoppingCart,    color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20'    },
        { label: 'Total Revenue',   value: fmt(stats.total_revenue),  icon: PhilippinePeso,  color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        { label: 'Products',        value: `${stats.active_products} / ${stats.total_products}`, icon: Package, color: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
        { label: 'Commission Paid', value: fmt(stats.commissions),    icon: PhilippinePeso,  color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20'   },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={store.store_name} />

            <div className="p-6 space-y-6 max-w-5xl">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/stores">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold tracking-tight">{store.store_name}</h1>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[store.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                    {store.status}
                                </span>
                            </div>
                            <p className="text-muted-foreground text-sm mt-0.5">
                                Applied {store.created_at}
                                {store.approved_at && ` · Approved ${store.approved_at}`}
                                {store.approved_by_name && ` by ${store.approved_by_name}`}
                            </p>
                            {store.status === 'suspended' && store.suspension_reason && (
                                <div className="mt-2 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm">
                                    <span className="font-medium text-orange-700">Suspended:</span>{' '}
                                    <span className="text-orange-600">{store.suspension_reason}</span>
                                    {store.suspension_notes && (
                                        <span className="text-orange-500 italic"> — "{store.suspension_notes}"</span>
                                    )}
                                    {store.suspended_at && (
                                        <span className="ml-2 text-xs text-orange-400">{store.suspended_at}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                        {store.status === 'pending' && (
                            <>
                                <Button onClick={() => setShowReject(true)} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                </Button>
                                <Button onClick={approve} className="bg-green-600 hover:bg-green-700 text-white">
                                    <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
                                </Button>
                            </>
                        )}
                        {store.status === 'approved' && (
                            <Button onClick={() => setShowSuspend(true)} variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50">
                                <PauseCircle className="h-4 w-4 mr-1.5" /> Suspend
                            </Button>
                        )}
                        {store.status === 'suspended' && (
                            <Button onClick={unsuspend} className="bg-green-600 hover:bg-green-700 text-white">
                                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Reinstate
                            </Button>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {statItems.map(({ label, value, icon: Icon, color, bg }) => (
                        <Card key={label}>
                            <CardContent className="pt-5">
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
                                        <Icon className={`h-5 w-5 ${color}`} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className="font-bold text-lg leading-tight">{value}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Store info */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-600" /> Store Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            {store.description && (
                                <p className="text-muted-foreground">{store.description}</p>
                            )}
                            <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                <span>{formatAddress(store.address, store.barangay, store.city)}</span>
                            </div>
                            {store.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span>{store.phone}</span>
                                </div>
                            )}
                            {store.email && (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span>{store.email}</span>
                                </div>
                            )}
                            <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-1.5">Commission Rate</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={commData.commission_rate}
                                        onChange={(e) => setCommData('commission_rate', e.target.value)}
                                        className="w-24 h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring tabular-nums"
                                    />
                                    <span className="text-sm text-muted-foreground">%</span>
                                    <Button
                                        size="sm"
                                        className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                        disabled={commProcessing}
                                        onClick={() => patchComm(`/admin/stores/${store.id}/commission-rate`)}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Owner info */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <BadgeCheck className="h-4 w-4 text-emerald-600" /> Owner / Documents
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Name</p>
                                <p className="font-semibold">{store.owner_name ?? '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{store.owner_email ?? '—'}</span>
                            </div>
                            {store.owner_phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span>{store.owner_phone}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${store.owner_id_verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    ID {store.owner_id_verified ? 'verified' : 'unverified'}
                                </span>
                            </div>

                            <div className="pt-2 border-t space-y-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Valid ID (Owner)</span>
                                        <DocLink url={store.valid_id_url} label="View ID" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">BIR Registration</span>
                                        <DocLink url={store.bir_permit_url} label="View BIR" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Business Permit</span>
                                        <DocLink url={store.business_permit_url} label="View Permit" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">FSIC (Fire Safety)</span>
                                        <DocLink url={store.fsic_permit_url} label="View FSIC" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">DOE LPG License</span>
                                        <DocLink url={store.doe_lpg_license_url} label="View DOE License" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">LTO (License to Operate)</span>
                                        <DocLink url={store.lto_permit_url} label="View LTO" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Agreed to Terms</span>
                                    {store.terms_agreed_at ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes, on {store.terms_agreed_at}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Action History */}
                {history.length > 0 && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4 text-gray-400" />
                                Store Action History
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

            {/* Reject dialog */}
            <AlertDialog open={showReject} onOpenChange={(o) => { if (!o) { setShowReject(false); rejectForm.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Store Application</AlertDialogTitle>
                        <AlertDialogDescription>
                            Provide a reason for rejecting <strong>{store.store_name}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <textarea
                        className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Reason for rejection…"
                        value={rejectForm.data.reason}
                        onChange={(e) => rejectForm.setData('reason', e.target.value)}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitReject}
                            disabled={!rejectForm.data.reason.trim() || rejectForm.processing}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Reject Store
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Suspend dialog */}
            <AlertDialog open={showSuspend} onOpenChange={(o) => { if (!o) { setShowSuspend(false); suspendForm.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Suspend Store</AlertDialogTitle>
                        <AlertDialogDescription>
                            Suspend <strong>{store.store_name}</strong>? Customers will be unable to order from this store until reinstated.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <div className="grid gap-1.5">
                            <label className="text-sm font-medium text-gray-700">Reason <span className="text-red-500">*</span></label>
                            <select
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            <label className="text-sm font-medium text-gray-700">Additional notes <span className="text-gray-400">(optional)</span></label>
                            <textarea
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                                rows={3}
                                placeholder="Provide more context if needed…"
                                value={suspendForm.data.notes}
                                onChange={(e) => suspendForm.setData('notes', e.target.value)}
                            />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitSuspend}
                            disabled={!suspendForm.data.reason || suspendForm.processing}
                            className="bg-orange-600 hover:bg-orange-700"
                        >
                            {suspendForm.processing ? 'Suspending…' : 'Suspend Store'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
