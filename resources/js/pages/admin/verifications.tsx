import { Head, router, useForm } from '@inertiajs/react';
import { BadgeCheck, CheckCircle2, ExternalLink, FileText, Search, XCircle } from 'lucide-react';
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
    valid_id_url: string | null;
    bir_permit_url: string | null;
    business_permit_url: string | null;
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

function DocLink({ url, label }: { url: string | null; label: string }) {
    if (!url) return <span className="text-xs text-muted-foreground">—</span>;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
        >
            <FileText className="h-3 w-3" /> {label} <ExternalLink className="h-2.5 w-2.5" />
        </a>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Verifications({ verifications, counts, tab, search }: Props) {
    const [searchVal, setSearchVal]     = useState(search);
    const [approveTarget, setApproveTarget] = useState<VerificationRow | null>(null);
    const [rejectTarget, setRejectTarget]   = useState<VerificationRow | null>(null);

    const { data, setData, patch, processing, reset } = useForm({ reason: '' });

    function goTab(t: string) {
        router.get('/admin/verifications', { tab: t, search: searchVal }, { preserveState: true, replace: true });
    }

    function doSearch(e: React.FormEvent) {
        e.preventDefault();
        router.get('/admin/verifications', { tab, search: searchVal }, { preserveState: true, replace: true });
    }

    function submitApprove() {
        router.patch(`/admin/verifications/${approveTarget?.id}/approve`, {}, {
            onSuccess: () => setApproveTarget(null),
        });
    }

    function submitReject() {
        patch(`/admin/verifications/${rejectTarget?.id}/reject`, {
            onSuccess: () => { setRejectTarget(null); reset(); },
        });
    }

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
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Documents</th>
                                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">ID Status</th>
                                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Submitted</th>
                                        {tab === 'pending' && (
                                            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                                        )}
                                        {(tab === 'approved' || tab === 'rejected') && (
                                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Reviewed</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {verifications.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-12 text-muted-foreground">
                                                No verifications in this category.
                                            </td>
                                        </tr>
                                    ) : verifications.data.map((v) => (
                                        <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{v.user_name}</p>
                                                <p className="text-xs text-muted-foreground">{v.user_email}</p>
                                            </td>
                                            <td className="px-4 py-3 hidden sm:table-cell">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    v.type === 'seller_application'
                                                        ? 'bg-purple-100 text-purple-700'
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {TYPE_LABELS[v.type] ?? v.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 hidden md:table-cell">
                                                <div className="flex flex-col gap-1">
                                                    <DocLink url={v.valid_id_url} label="Valid ID" />
                                                    {v.type === 'seller_application' && <>
                                                        <DocLink url={v.bir_permit_url} label="BIR Permit" />
                                                        <DocLink url={v.business_permit_url} label="Business Permit" />
                                                    </>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    v.user_id_verified
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {v.user_id_verified ? 'Verified' : 'Unverified'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                {v.created_at}
                                            </td>
                                            {tab === 'pending' && (
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-7 text-xs"
                                                            onClick={() => setRejectTarget(v)}>
                                                            <XCircle className="h-3 w-3 mr-1" /> Reject
                                                        </Button>
                                                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                                                            onClick={() => setApproveTarget(v)}>
                                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                                        </Button>
                                                    </div>
                                                </td>
                                            )}
                                            {(tab === 'approved' || tab === 'rejected') && (
                                                <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                                                    {v.reviewed_at ?? '—'}
                                                    {v.reviewer_name && <span className="block">by {v.reviewer_name}</span>}
                                                    {v.rejection_reason && (
                                                        <span className="block text-red-500 italic max-w-[180px] truncate" title={v.rejection_reason}>
                                                            {v.rejection_reason}
                                                        </span>
                                                    )}
                                                </td>
                                            )}
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

            {/* Approve dialog */}
            <AlertDialog open={!!approveTarget} onOpenChange={(o) => { if (!o) setApproveTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve Verification</AlertDialogTitle>
                        <AlertDialogDescription>
                            Approve the ID verification for <strong>{approveTarget?.user_name}</strong>? Their account will be marked as ID-verified.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={submitApprove} className="bg-green-600 hover:bg-green-700">Approve</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reject dialog */}
            <AlertDialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject Verification</AlertDialogTitle>
                        <AlertDialogDescription>
                            Provide a reason for rejecting <strong>{rejectTarget?.user_name}</strong>'s ID verification.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <textarea
                        className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={3}
                        placeholder="Reason for rejection…"
                        value={data.reason}
                        onChange={(e) => setData('reason', e.target.value)}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitReject}
                            disabled={!data.reason.trim() || processing}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Reject
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
