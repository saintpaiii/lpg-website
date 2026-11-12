import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    BadgeCheck,
    Building2,
    CheckCircle2,
    Clock,
    Crown,
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
    AlertTriangle,
    ShieldCheck,
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
import { ADMIN_PLAN_STATUS } from '@/lib/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import PermitBadge, { type PermitStatus } from '@/components/permit-badge';
import StoreAvatar from '@/components/store-avatar';
import StoreLocationLink from '@/components/store-location-link';
import type { BreadcrumbItem } from '@/types';
import { formatAddress } from '@/data/cavite-locations';
import DocumentRow, { DocumentHeading } from '@/components/document-row';
import { AUTO_READ_DISCLAIMER, AutoReadLine, useAutoRead, type OcrResult } from '@/components/document-auto-read';
import { Checkbox } from '@/components/ui/checkbox';
import { ReasonPicker, ReasonTextPicker } from '@/components/reason-picker';

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
    dti_sec_registration_url: string | null;
    /** 'dti' | 'sec'; null = registered before DTI/SEC was required */
    dti_sec_kind?: 'dti' | 'sec' | null;
    /** The old separate LTO upload (same as the DOE License to Operate — no longer required) */
    old_lto_permit_url?: string | null;
    terms_agreed_at: string | null;
    suspension_reason: string | null;
    suspension_notes: string | null;
    suspended_at: string | null;
    logo_url: string | null;
    latitude: number | null;
    longitude: number | null;
    documents_suspended: boolean;
    permits: { type: string; label: string; expires_on: string | null; days_left: number | null; status: PermitStatus }[];
};

type DocumentHistoryRow = {
    id: number; label: string; date: string; expires_on: string | null;
    status: 'pending' | 'approved' | 'rejected'; reviewer: string | null; reason: string | null; url: string;
    is_other?: boolean; ocr_key?: string; ocr?: OcrResult;
};

type DuplicateMatch = {
    store_id: number; store_name: string; city: string | null; status: string;
    fields: string[]; documents?: string[]; distance_m?: number | null;
};

type ApprovalChecks = { items: string[]; note: string | null; by_name: string | null; at: string | null } | null;

const DUPLICATE_FIELD_LABEL: Record<string, string> = {
    same_name:     'same name',
    near_location: 'pinned within 50 m',
    same_address:  'same address',
    same_phone:    'same phone number',
    same_files:    'same document file',
};

/** Which auto-read results to show next to each checklist item */
const CHECK_SOURCES: Record<string, { keys: string[]; only?: RegExp }> = {
    id_matches_owner:   { keys: ['valid_id'] },
    bir_matches:        { keys: ['bir_permit', 'dti_sec_registration'] },
    permits_readable:   { keys: ['business_permit', 'fsic_permit', 'doe_lpg_license'] },
    expiry_dates_match: { keys: ['business_permit', 'fsic_permit', 'doe_lpg_license'], only: /expiry|date/i },
};

type ActionHistory = {
    id: number;
    action: string;
    reason: string | null;
    notes: string | null;
    performed_by: string;
    created_at: string;
};

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
    delivered_orders: number;
};

type StoreSubscription = {
    plan: string;
    status: 'trial' | 'active' | 'ending' | 'expired' | 'none';
    expires: string | null;
    days_left: number;
    usage?: { products: number; staff: number; vehicles: number };
    limits?: { products: number | null; staff: number | null; vehicles: number | null };
    paused?: { products: number; staff: number; vehicles: number };
    /** Cash recorded by the admin, waiting for the owner to accept */
    awaiting?: { plan: string; amount: number; since: string } | null;
    payments: { id: number; receipt_number: string | null; plan: string; amount: number; method: string; period: string; paid_at: string | null }[];
};

type Props = {
    store: StoreDetail;
    stats: StoreStats;
    subscription?: StoreSubscription;
    visibility?: { visible: boolean; reasons: { code: string; text: string }[] } | null;
    history: ActionHistory[];
    documentHistory: DocumentHistoryRow[];
    checklist?: { key: string; label: string }[];
    approvalChecks?: ApprovalChecks;
    duplicates?: DuplicateMatch[];
    ocrEnabled?: boolean;
    /** valid_id + required doc types that have a file → saved result (null = not read yet) */
    documentOcr?: Record<string, OcrResult>;
    canReviewDocuments?: boolean;
    canApprove?: boolean;
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

export default function StoreShow({
    store, stats, subscription, visibility, history, documentHistory,
    checklist = [], approvalChecks = null, duplicates = [], ocrEnabled = false, documentOcr = {}, canReviewDocuments = false, canApprove = false,
}: Props) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/admin/dashboard' },
        { title: 'Stores',    href: '/admin/stores' },
        { title: store.store_name, href: `/admin/stores/${store.id}` },
    ];

    const [showReject, setShowReject]   = useState(false);
    const [showSuspend, setShowSuspend] = useState(false);

    const rejectForm = useForm({ reason: '' });

    const suspendForm = useForm({ reason: '', notes: '' });


    // "Before you approve": every item ticked + optional note (saved with the approval)
    const approveForm = useForm<{ checks: Record<string, boolean>; note: string }>({ checks: {}, note: '' });
    const allChecked = checklist.length > 0 && checklist.every((c) => approveForm.data.checks[c.key]);
    const approveError = approveForm.errors.checks
        ?? Object.entries(approveForm.errors).find(([k]) => k.startsWith('checks.'))?.[1]
        ?? approveForm.errors.note;

    function approve() {
        if (!allChecked) return;
        approveForm.patch(`/admin/stores/${store.id}/approve`, { preserveScroll: true });
    }

    // Auto-read (OCR): required documents + the owner's ID + documents uploaded later, read one by one
    const ocrJobs: Record<string, number> = {};
    const ocrInitial: Record<string, OcrResult> = {};
    for (const [k, v] of Object.entries(documentOcr)) { ocrJobs[k] = store.id; ocrInitial[k] = v; }
    for (const d of documentHistory) if (d.ocr_key) { ocrJobs[d.ocr_key] = store.id; ocrInitial[d.ocr_key] = d.ocr ?? null; }
    const autoRead = useAutoRead(ocrJobs, ocrInitial, ocrEnabled && canReviewDocuments);
    const ocrLine = (key: string) => key in ocrJobs ? (
        <AutoReadLine
            result={autoRead.results[key] ?? null} reading={autoRead.reading === key} enabled={ocrEnabled}
            canRead={canReviewDocuments} onReadAgain={() => autoRead.readAgain(key)}
        />
    ) : null;
    const checkHints = (key: string): string[] => {
        if (key === 'no_duplicate_concern') {
            return duplicates.length ? [`${duplicates.length} possible duplicate${duplicates.length > 1 ? 's' : ''} — see the red box`] : [];
        }
        const src = CHECK_SOURCES[key];
        if (!src) return [];
        return src.keys.flatMap((k) => (autoRead.results[k]?.warnings ?? []).filter((w) => !src.only || src.only.test(w)));
    };

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
        { label: 'Delivered Orders', value: stats.delivered_orders, icon: ShoppingCart,    color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20'   },
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
                                <StoreAvatar name={store.store_name} logoUrl={store.logo_url} size={40} />
                                <h1 className="text-2xl font-bold tracking-tight">{store.store_name}</h1>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[store.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                    {store.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                                {store.documents_suspended && (
                                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                                        Hidden from customers (expired documents)
                                    </span>
                                )}
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
                    <div data-tour="ass-actions" className="flex items-center gap-2">
                        {store.status === 'pending' && (
                            <>
                                <Button onClick={() => setShowReject(true)} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                                    <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                </Button>
                                {canApprove && (
                                    <Button
                                        onClick={() => (allChecked ? approve() : document.getElementById('approve-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))}
                                        disabled={approveForm.processing}
                                        title={allChecked ? undefined : 'Tick every item in "Before you approve" first'}
                                        className={`text-white ${allChecked ? 'bg-green-600 hover:bg-green-700' : 'bg-green-600/50 hover:bg-green-600/60'}`}
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
                                    </Button>
                                )}
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

                <div className="grid items-stretch gap-6 lg:grid-cols-2">
                    {/* Store info */}
                    <Card className="h-full">
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
                        </CardContent>
                    </Card>

                    {/* Owner info */}
                    <Card data-tour="ass-documents" className="h-full">
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

                            <div className="pt-2 border-t">
                                <DocumentRow label={<DocumentHeading>Store location</DocumentHeading>}>
                                    <StoreLocationLink lat={store.latitude} lng={store.longitude} />
                                </DocumentRow>
                            </div>

                            <div className="pt-2 border-t space-y-2">
                                <DocumentHeading>Documents</DocumentHeading>
                                <div className="space-y-2">
                                    <div>
                                        <DocumentRow label="Valid ID (Owner)">
                                            <DocLink url={store.valid_id_url} label="View" />
                                        </DocumentRow>
                                        {ocrLine('valid_id')}
                                    </div>
                                    {store.permits.map((p) => {
                                        const url = (store as unknown as Record<string, string | null>)[`${p.type}_url`];
                                        const isDtiSec = p.type === 'dti_sec_registration';
                                        return (
                                            <div key={p.type}>
                                                <DocumentRow label={isDtiSec ? `DTI/SEC Registration${store.dti_sec_kind ? ` (${store.dti_sec_kind.toUpperCase()})` : ''}` : p.label}>
                                                    {isDtiSec && !url ? (
                                                        <span className="whitespace-normal text-right text-xs italic text-muted-foreground">Not provided (registered before this was required)</span>
                                                    ) : (
                                                        <>
                                                            <PermitBadge p={p} />
                                                            <DocLink url={url} label="View" />
                                                        </>
                                                    )}
                                                </DocumentRow>
                                                {ocrLine(p.type)}
                                            </div>
                                        );
                                    })}
                                </div>
                                {store.old_lto_permit_url && (
                                    <div className="space-y-1 pt-1">
                                        <DocumentHeading>Older documents</DocumentHeading>
                                        <DocumentRow label={<span>LTO (License to Operate) <span className="block text-xs text-muted-foreground">Same as the DOE LTO — no longer required</span></span>}>
                                            <DocLink url={store.old_lto_permit_url} label="View" />
                                        </DocumentRow>
                                    </div>
                                )}
                                {Object.keys(documentOcr).length > 0 && (
                                    <p className="text-[11px] italic text-muted-foreground">{AUTO_READ_DISCLAIMER}</p>
                                )}
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

                {/* Possible duplicates (saved at registration / rename) — a warning, the admin decides */}
                {duplicates.length > 0 && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" /> Possible duplicate store</p>
                        <ul className="mt-1.5 space-y-1">
                            {duplicates.map((m) => (
                                <li key={m.store_id} className="break-words">
                                    <Link href={`/admin/stores/${m.store_id}`} className="font-medium underline">{m.store_name}</Link>
                                    {m.city && ` (${m.city})`} · <span className="capitalize">{m.status}</span> — {m.fields.map((x) => DUPLICATE_FIELD_LABEL[x] ?? x).join(', ')}
                                    {m.documents && m.documents.length > 0 && ` (${m.documents.join(', ')})`}
                                    {m.distance_m != null && ` · ${m.distance_m} m away`}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-1.5 text-xs">Check these before approving (checklist: “Duplicate warnings checked”).</p>
                    </div>
                )}

                {/* Before you approve — every item must be ticked */}
                {store.status === 'pending' && canApprove && checklist.length > 0 && (
                    <Card data-tour="ass-checklist" id="approve-checklist" className="scroll-mt-20 border-green-200 dark:border-green-900">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-green-600" /> Before you approve</CardTitle>
                            <p className="text-xs text-muted-foreground">Tick each item after checking it yourself. {AUTO_READ_DISCLAIMER}</p>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {checklist.map((c) => {
                                const hints = checkHints(c.key);
                                return (
                                    <label key={c.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={!!approveForm.data.checks[c.key]}
                                            onCheckedChange={(v) => approveForm.setData('checks', { ...approveForm.data.checks, [c.key]: v === true })}
                                        />
                                        <span className="min-w-0">
                                            <span>{c.label}</span>
                                            {hints.map((h, i) => (
                                                <span key={i} className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span className="break-words">{h}</span>
                                                </span>
                                            ))}
                                        </span>
                                    </label>
                                );
                            })}
                            <div className="grid gap-1">
                                <label htmlFor="approve-note" className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                                <textarea
                                    id="approve-note" rows={2} maxLength={500} value={approveForm.data.note}
                                    onChange={(e) => approveForm.setData('note', e.target.value)}
                                    placeholder="e.g. Called the owner to confirm the address."
                                    className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            {approveError && <p className="text-sm text-red-600">{approveError}</p>}
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {!allChecked && <span className="text-xs text-muted-foreground">Tick every item to approve.</span>}
                                <Button onClick={approve} disabled={!allChecked || approveForm.processing} className="bg-green-600 text-white hover:bg-green-700">
                                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> {approveForm.processing ? 'Approving…' : 'Approve store'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Saved checklist (read-only) */}
                {store.status !== 'pending' && store.approved_at && (
                    approvalChecks ? (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-green-600" /> Approval checklist</CardTitle>
                                <p className="text-xs text-muted-foreground">Checked by {approvalChecks.by_name ?? '—'}{approvalChecks.at ? ` on ${approvalChecks.at}` : ''}</p>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-sm">
                                {approvalChecks.items.map((i) => (
                                    <p key={i} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> {i}</p>
                                ))}
                                {approvalChecks.note && <p className="mt-2 rounded bg-muted px-3 py-2 text-xs italic">“{approvalChecks.note}”</p>}
                            </CardContent>
                        </Card>
                    ) : (
                        <p className="text-xs text-muted-foreground">Approved before the checklist existed.</p>
                    )
                )}

                {/* Hidden from customers? */}
                {visibility && !visibility.visible && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        <strong>Hidden from customers:</strong>{' '}
                        {visibility.reasons.map((r) => (r.code.startsWith('license') || r.code.includes('rider') ? `no eligible rider (${r.text.toLowerCase()})` : r.text.toLowerCase())).join(' · ')}
                    </div>
                )}

                {/* Plan */}
                {subscription && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                                <span className="flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Plan</span>
                                <span className="flex gap-3 text-xs font-medium">
                                    <Link href={`/admin/subscriptions?tab=stores&search=${encodeURIComponent(store.store_name)}`} className="text-blue-600 hover:underline">
                                        Give free days / record cash
                                    </Link>
                                    <Link href={`/admin/subscriptions?tab=payments&search=${encodeURIComponent(store.store_name)}`} className="text-blue-600 hover:underline">
                                        All payments
                                    </Link>
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                                <span><span className="text-muted-foreground">Plan:</span> <strong>{subscription.plan}</strong></span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ADMIN_PLAN_STATUS[subscription.status]?.cls}`}>
                                    {ADMIN_PLAN_STATUS[subscription.status]?.label}
                                </span>
                                <span><span className="text-muted-foreground">Expires:</span> {subscription.expires ?? '—'}</span>
                                {subscription.status !== 'expired' && subscription.status !== 'none' && (
                                    <span><span className="text-muted-foreground">Days left:</span> {subscription.days_left}</span>
                                )}
                            </div>
                            {subscription.awaiting && (
                                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    <strong>Waiting for seller:</strong> {subscription.awaiting.plan} ₱{subscription.awaiting.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (since {subscription.awaiting.since}) — the plan changes when the owner accepts.
                                </p>
                            )}
                            {subscription.usage && subscription.limits && (
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {([['products', 'Published products'], ['staff', 'Staff accounts'], ['vehicles', 'Vehicles']] as const).map(([k, label]) => {
                                        const used = subscription.usage![k];
                                        const limit = subscription.limits![k];
                                        const paused = subscription.paused?.[k] ?? 0;
                                        return (
                                            <div key={k} className={`rounded-lg border px-3 py-2 ${limit != null && used >= limit ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : ''}`}>
                                                <p className="text-xs text-muted-foreground">{label}</p>
                                                <p className="font-semibold tabular-nums">{used} / {limit ?? 'Unlimited'}</p>
                                                {paused > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{paused} paused (plan limit)</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {subscription.payments.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                <th className="py-2 pr-4">Receipt #</th>
                                                <th className="py-2 pr-4">Plan</th>
                                                <th className="py-2 pr-4">Method</th>
                                                <th className="py-2 pr-4">Period</th>
                                                <th className="py-2 pr-4 text-right">Amount</th>
                                                <th className="py-2" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {subscription.payments.map((p) => (
                                                <tr key={p.id}>
                                                    <td className="py-2 pr-4 font-mono text-xs">{p.receipt_number ?? '—'}</td>
                                                    <td className="py-2 pr-4">{p.plan}</td>
                                                    <td className="py-2 pr-4">{p.method}</td>
                                                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{p.period}</td>
                                                    <td className="py-2 pr-4 text-right tabular-nums">₱{p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                                                    <td className="py-2 text-right">
                                                        {p.receipt_number && (
                                                            <a href={`/admin/subscriptions/payments/${p.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">Receipt</a>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No plan payments yet.</p>
                            )}
                        </CardContent>
                    </Card>
                )}

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
                {/* Renewed permits / extra documents uploaded by the store */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                            <span>Document history</span>
                            {documentHistory.some((d) => d.status === 'pending') && (
                                <Link href="/admin/store-documents" className="text-sm font-normal text-blue-600 hover:underline">Review in Store Documents →</Link>
                            )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">Extra documents never block approval or hide the store.</p>
                    </CardHeader>
                    <CardContent>
                        {documentHistory.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">No renewed or extra documents uploaded yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-muted-foreground">
                                            <th className="pb-2 pr-3 font-medium">Document</th>
                                            <th className="pb-2 pr-3 font-medium">Uploaded</th>
                                            <th className="pb-2 pr-3 font-medium">Valid until</th>
                                            <th className="pb-2 pr-3 font-medium">Status</th>
                                            <th className="pb-2 pr-3 font-medium">Reviewed by</th>
                                            <th className="pb-2" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {documentHistory.map((d) => (
                                            <tr key={d.id}>
                                                <td className="min-w-[14rem] py-2 pr-3">
                                                    {d.is_other ? `Other — ${d.label}` : d.label}
                                                    {d.ocr_key && ocrLine(d.ocr_key)}
                                                </td>
                                                <td className="py-2 pr-3 whitespace-nowrap">{d.date}</td>
                                                <td className="py-2 pr-3 whitespace-nowrap">{d.expires_on ?? '—'}</td>
                                                <td className="py-2 pr-3">
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === 'approved' ? 'bg-green-100 text-green-800' : d.status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                                                        {d.status === 'pending' ? 'Waiting for review' : d.status === 'approved' ? 'Approved' : 'Rejected'}
                                                    </span>
                                                    {d.reason && <span className="block text-xs text-red-600">{d.reason}</span>}
                                                </td>
                                                <td className="py-2 pr-3">{d.reviewer ?? '—'}</td>
                                                <td className="py-2 text-right"><a href={d.url} target="_blank" rel="noopener" className="text-blue-600 hover:underline">View</a></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
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
                    <ReasonTextPicker
                        context="store_reject"
                        reasonLabel="Reason"
                        value={rejectForm.data.reason}
                        onChange={(v) => rejectForm.setData('reason', v)}
                        rows={3}
                        placeholder="Reason for rejection…"
                        textareaClassName="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <ReasonPicker
                            context="account_store_suspend"
                            reasonLabel="Reason"
                            reason={suspendForm.data.reason}
                            notes={suspendForm.data.notes}
                            onChange={(next) => { suspendForm.setData('reason', next.reason); suspendForm.setData('notes', next.notes); }}
                            rows={3}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitSuspend}
                            disabled={!suspendForm.data.reason || !suspendForm.data.notes.trim() || suspendForm.processing}
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
