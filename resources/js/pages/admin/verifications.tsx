import { Head, router, useForm } from '@inertiajs/react';
import { BadgeCheck, CheckCircle2, ExternalLink, Eye, FileText, Search, XCircle } from 'lucide-react';
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard',     href: '/admin/dashboard' },
    { title: 'Verifications', href: '/admin/verifications' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type VerificationRow = {
    id: number;
    type: string;
    status: string;
    rejection_reason: string | null;
    reviewed_at: string | null;
    created_at: string;
    user_id: number;
    user_name: string;
    user_email: string;
    user_id_verified: boolean;
    reviewer_name: string | null;
    // Store info
    store_name: string | null;
    store_phone: string | null;
    store_address: string | null;
    store_city: string | null;
    store_barangay: string | null;
    // Resubmission
    is_resubmission: boolean;
    previous_rejection_reason: string | null;
    reuploaded_docs: string[];
    // Document URLs
    valid_id_url: string | null;
    bir_permit_url: string | null;
    business_permit_url: string | null;
    fsic_permit_url: string | null;
    doe_lpg_license_url: string | null;
    lto_permit_url: string | null;
};

type Counts = { pending: number; approved: number; rejected: number };
type Paginated = { data: VerificationRow[]; current_page: number; last_page: number; total: number };

type Props = {
    verifications: Paginated;
    counts: Counts;
    tab: string;
    search: string;
};

const TABS = [
    { key: 'pending',  label: 'Pending',  count_key: 'pending'  },
    { key: 'approved', label: 'Approved', count_key: 'approved' },
    { key: 'rejected', label: 'Rejected', count_key: 'rejected' },
] as const;

const TYPE_LABELS: Record<string, string> = {
    customer_id_verification: 'Customer ID',
    seller_application:       'Seller Application',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function DocRow({ label, url }: { label: string; url: string | null }) {
    return (
        <div className="flex items-center justify-between py-2 border-b last:border-0">
            <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
            {url ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                    <FileText className="h-3.5 w-3.5" /> View <ExternalLink className="h-3 w-3" />
                </a>
            ) : (
                <span className="text-sm text-muted-foreground italic">Not uploaded</span>
            )}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Verifications({ verifications, counts, tab, search }: Props) {
    const [searchVal, setSearchVal]         = useState(search);
    const [detailTarget, setDetailTarget]   = useState<VerificationRow | null>(null);
    const [rejectMode, setRejectMode]       = useState(false);
    const [approveTarget, setApproveTarget] = useState<VerificationRow | null>(null);

    const { data, setData, patch, processing, reset } = useForm({ reason: '' });

    function goTab(t: string) {
        router.get('/admin/verifications', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/verifications', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    function closeDetail() {
        setDetailTarget(null);
        setRejectMode(false);
        reset();
    }

    function openApprove(v: VerificationRow) {
        setDetailTarget(null);
        setRejectMode(false);
        setApproveTarget(v);
    }

    function submitApprove() {
        router.patch(`/admin/verifications/${approveTarget?.id}/approve`, {}, {
            onSuccess: () => setApproveTarget(null),
        });
    }

    function submitReject() {
        patch(`/admin/verifications/${detailTarget?.id}/reject`, {
            onSuccess: () => closeDetail(),
        });
    }

    const v = detailTarget;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Verifications" />

            <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <BadgeCheck className="h-6 w-6 text-blue-600" />
                            ID Verifications
                        </h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            Review uploaded IDs and approve or reject customer & seller verifications.
                        </p>
                    </div>
                    <form onSubmit={doSearch} className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email…"
                                className="pl-9 w-60"
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
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">ID Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Submitted</th>
                                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {verifications.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-muted-foreground">
                                                No verifications in this category.
                                            </td>
                                        </tr>
                                    ) : verifications.data.map((row) => (
                                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{row.user_name}</p>
                                                <p className="text-xs text-muted-foreground">{row.user_email}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        row.type === 'seller_application'
                                                            ? 'bg-purple-100 text-purple-700'
                                                            : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {TYPE_LABELS[row.type] ?? row.type}
                                                    </span>
                                                    {row.is_resubmission && row.status === 'pending' && (
                                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
                                                            Resubmitted
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    row.user_id_verified
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {row.user_id_verified ? 'Verified' : 'Unverified'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                {row.created_at}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {(tab === 'approved' || tab === 'rejected') && (
                                                        <span className="text-xs text-muted-foreground text-right hidden lg:block">
                                                            {row.reviewed_at ?? '—'}
                                                            {row.reviewer_name && <span className="block">by {row.reviewer_name}</span>}
                                                        </span>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs gap-1"
                                                        onClick={() => { setDetailTarget(row); setRejectMode(false); reset(); }}
                                                    >
                                                        <Eye className="h-3 w-3" /> View Details
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {verifications.last_page > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                                <span>{verifications.total} records</span>
                                <div className="flex gap-1">
                                    {Array.from({ length: verifications.last_page }, (_, i) => i + 1).map((p) => (
                                        <button key={p}
                                            onClick={() => router.get('/admin/verifications', { tab, search: searchVal, page: p })}
                                            className={`w-8 h-8 rounded text-xs font-medium ${p === verifications.current_page ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Details Dialog ──────────────────────────────────────────────── */}
            <Dialog open={!!detailTarget} onOpenChange={(o) => { if (!o) closeDetail(); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <BadgeCheck className="h-5 w-5 text-blue-600" />
                            {v?.type === 'seller_application' ? 'Seller Application' : 'ID Verification'}
                            {v?.is_resubmission && v?.status === 'pending' && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700">
                                    Resubmitted
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {v && !rejectMode && (
                        <div className="space-y-5 py-1">

                            {/* 1. Applicant Info */}
                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Applicant Info</h3>
                                <div className="rounded-md border p-3 space-y-1.5">
                                    <div className="flex gap-2">
                                        <span className="text-sm text-muted-foreground w-24 shrink-0">Name</span>
                                        <span className="text-sm font-medium">{v.user_name}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-sm text-muted-foreground w-24 shrink-0">Email</span>
                                        <span className="text-sm">{v.user_email}</span>
                                    </div>
                                    {v.type === 'seller_application' && <>
                                        {v.store_name && (
                                            <div className="flex gap-2">
                                                <span className="text-sm text-muted-foreground w-24 shrink-0">Store Name</span>
                                                <span className="text-sm font-medium">{v.store_name}</span>
                                            </div>
                                        )}
                                        {v.store_phone && (
                                            <div className="flex gap-2">
                                                <span className="text-sm text-muted-foreground w-24 shrink-0">Phone</span>
                                                <span className="text-sm">{v.store_phone}</span>
                                            </div>
                                        )}
                                        {v.store_address && (
                                            <div className="flex gap-2">
                                                <span className="text-sm text-muted-foreground w-24 shrink-0">Address</span>
                                                <span className="text-sm">
                                                    {v.store_address}
                                                    {v.store_barangay ? `, ${v.store_barangay}` : ''}
                                                    {v.store_city ? `, ${v.store_city}` : ''}
                                                </span>
                                            </div>
                                        )}
                                    </>}
                                </div>
                            </section>

                            {/* 2. Documents */}
                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Documents</h3>
                                <div className="rounded-md border px-3 divide-y">
                                    <DocRow label="Valid ID" url={v.valid_id_url} />
                                    {v.type === 'seller_application' && <>
                                        <DocRow label="BIR Certificate of Registration" url={v.bir_permit_url} />
                                        <DocRow label="Business Permit / Mayor's Permit" url={v.business_permit_url} />
                                        <DocRow label="FSIC (Fire Safety Inspection Certificate)" url={v.fsic_permit_url} />
                                        <DocRow label="DOE LPG Retail License" url={v.doe_lpg_license_url} />
                                        <DocRow label="LTO (License to Operate)" url={v.lto_permit_url} />
                                    </>}
                                </div>
                            </section>

                            {/* 3. Resubmission Info */}
                            {v.is_resubmission && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Resubmission History</h3>
                                    <div className="rounded-md border p-3 space-y-2">
                                        {v.previous_rejection_reason && (
                                            <div>
                                                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-0.5">Previous rejection reason:</p>
                                                <p className="text-sm text-gray-700 dark:text-gray-300 italic">{v.previous_rejection_reason}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground mb-0.5">Documents re-uploaded:</p>
                                            {v.reuploaded_docs.length > 0 ? (
                                                <p className="text-sm text-emerald-600 dark:text-emerald-400">{v.reuploaded_docs.join(', ')}</p>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">None — all documents kept from previous submission.</p>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* 4. Reviewed info (approved/rejected tabs) */}
                            {(v.status === 'approved' || v.status === 'rejected') && (
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Review Decision</h3>
                                    <div className="rounded-md border p-3 space-y-1.5">
                                        <div className="flex gap-2">
                                            <span className="text-sm text-muted-foreground w-24 shrink-0">Decision</span>
                                            <span className={`text-sm font-medium ${v.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                                {v.status === 'approved' ? 'Approved' : 'Rejected'}
                                            </span>
                                        </div>
                                        {v.reviewed_at && (
                                            <div className="flex gap-2">
                                                <span className="text-sm text-muted-foreground w-24 shrink-0">Reviewed</span>
                                                <span className="text-sm">{v.reviewed_at}{v.reviewer_name ? ` by ${v.reviewer_name}` : ''}</span>
                                            </div>
                                        )}
                                        {v.rejection_reason && (
                                            <div className="flex gap-2">
                                                <span className="text-sm text-muted-foreground w-24 shrink-0">Reason</span>
                                                <span className="text-sm text-red-600 dark:text-red-400 italic">{v.rejection_reason}</span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* 5. Action buttons (pending tab only) */}
                            {tab === 'pending' && (
                                <div className="flex justify-end gap-2 pt-2 border-t">
                                    <Button
                                        variant="outline"
                                        className="border-red-300 text-red-600 hover:bg-red-50"
                                        onClick={() => setRejectMode(true)}
                                    >
                                        <XCircle className="h-4 w-4 mr-1.5" /> Reject
                                    </Button>
                                    <Button
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                        onClick={() => openApprove(v)}
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Reject mode: show reason input */}
                    {v && rejectMode && (
                        <div className="space-y-4 py-1">
                            <p className="text-sm text-muted-foreground">
                                Provide a reason for rejecting <strong>{v.user_name}</strong>'s application.
                                This will be shown to the applicant so they know what to fix.
                            </p>
                            <textarea
                                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                                rows={4}
                                placeholder="e.g. BIR certificate appears expired. Please re-upload a current copy."
                                value={data.reason}
                                onChange={(e) => setData('reason', e.target.value)}
                                autoFocus
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <Button variant="outline" onClick={() => setRejectMode(false)}>
                                    ← Back
                                </Button>
                                <Button
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    onClick={submitReject}
                                    disabled={!data.reason.trim() || processing}
                                >
                                    Confirm Rejection
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Approve confirmation ────────────────────────────────────────── */}
            <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve Application</AlertDialogTitle>
                        <AlertDialogDescription>
                            Approve the seller application for <strong>{approveTarget?.user_name}</strong>?
                            Their account will be promoted to seller and they can access the seller portal.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitApprove} className="bg-green-600 hover:bg-green-700">
                            Approve
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
