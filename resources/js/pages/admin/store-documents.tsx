import { Head, Link, useForm } from '@inertiajs/react';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { ReasonTextPicker } from '@/components/reason-picker';

type Pending = {
    id: number; store_id: number; store_name: string | null; doc_type: string; label: string; is_other: boolean; has_expiry: boolean;
    current_expires: string | null; new_expires: string | null; new_expires_on: string | null; submitted_on: string; submitted_by: string | null; url: string;
};
type PermitRow = { store_id: number; store_name: string; type: string; label: string; expires_on: string | null; days_left: number | null; documents_suspended: boolean };
type Tab = 'pending' | 'expiring' | 'expired' | 'missing';

type Props = {
    tab: Tab;
    pending: Pending[];
    expiring: PermitRow[];
    expired: PermitRow[];
    missing: PermitRow[];
    counts: Record<Tab, number>;
    max_date: string;
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Store Documents', href: '/admin/store-documents' }];
const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Waiting for review' },
    { key: 'expiring', label: 'Expiring soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'missing', label: 'Missing dates' },
];

export default function AdminStoreDocuments({ tab: initialTab, pending, expiring, expired, missing, counts, max_date }: Props) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [approving, setApproving] = useState<Pending | null>(null);
    const [rejecting, setRejecting] = useState<Pending | null>(null);
    const approveForm = useForm({ expires_at: '' });
    const rejectForm = useForm({ reason: '' });

    function openApprove(p: Pending) {
        approveForm.clearErrors();
        approveForm.setData('expires_at', p.new_expires ?? '');
        setApproving(p);
    }
    function openReject(p: Pending) {
        rejectForm.reset();
        rejectForm.clearErrors();
        setRejecting(p);
    }
    const submitApprove = (e: FormEvent) => {
        e.preventDefault();
        if (approving) approveForm.post(`/admin/store-documents/${approving.id}/approve`, { preserveScroll: true, onSuccess: () => setApproving(null) });
    };
    const submitReject = (e: FormEvent) => {
        e.preventDefault();
        if (rejecting) rejectForm.post(`/admin/store-documents/${rejecting.id}/reject`, { preserveScroll: true, onSuccess: () => setRejecting(null) });
    };

    const rows = tab === 'expiring' ? expiring : tab === 'expired' ? expired : missing;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Store Documents" />
            <div className="space-y-4 p-3 sm:p-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Store Documents</h1>
                    <p className="text-sm text-muted-foreground">Renewed permits and extra documents from stores, and permits that are expiring, expired or missing a date.</p>
                </div>

                <div className="flex flex-wrap gap-1 border-b">
                    {TABS.map((t) => (
                        <button key={t.key} type="button" onClick={() => setTab(t.key)}
                            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
                            {t.label}
                            {counts[t.key] > 0 && (
                                <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', t.key === 'pending' || t.key === 'expired' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600')}>
                                    {counts[t.key]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {tab === 'pending' ? (
                    pending.length === 0 ? (
                        <p className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-500">Nothing is waiting for review.</p>
                    ) : (
                        <ul className="space-y-2">
                            {pending.map((p) => (
                                <li key={p.id} className="flex flex-col gap-3 rounded-lg border bg-white px-4 py-3 sm:flex-row sm:items-center dark:bg-gray-950">
                                    <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                                        <p className="font-semibold">{p.label}{p.is_other && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(extra document)</span>}</p>
                                        <p>
                                            <Link href={`/admin/stores/${p.store_id}`} className="text-blue-600 hover:underline">{p.store_name}</Link>
                                            <span className="text-muted-foreground"> · submitted {p.submitted_on}{p.submitted_by ? ` by ${p.submitted_by}` : ''}</span>
                                        </p>
                                        {p.has_expiry && (
                                            <p className="text-muted-foreground">
                                                Valid until: {p.is_other ? '' : `${p.current_expires ?? 'no date'} → `}<span className="font-medium text-foreground">{p.new_expires_on ?? 'no date'}</span>
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <a href={p.url} target="_blank" rel="noopener"><Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> View file</Button></a>
                                        <Button size="sm" className="gap-1.5 bg-green-600 text-white hover:bg-green-700" onClick={() => openApprove(p)}><Check className="h-3.5 w-3.5" /> Approve</Button>
                                        <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => openReject(p)}><X className="h-3.5 w-3.5" /> Reject</Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                ) : rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-500">No stores here.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2.5 font-medium">Store</th>
                                    <th className="px-4 py-2.5 font-medium">Document</th>
                                    <th className="px-4 py-2.5 font-medium">{tab === 'missing' ? 'Status' : 'Valid until'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map((r) => (
                                    <tr key={`${r.store_id}-${r.type}`}>
                                        <td className="px-4 py-2.5">
                                            <Link href={`/admin/stores/${r.store_id}`} className="font-medium text-blue-600 hover:underline">{r.store_name}</Link>
                                            {tab === 'expired' && r.documents_suspended && (
                                                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Hidden from customers</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">{r.label}</td>
                                        <td className="px-4 py-2.5">
                                            {tab === 'missing' ? 'No expiry date on file'
                                                : tab === 'expired' ? <span className="text-red-600">{r.expires_on} ({Math.abs(r.days_left ?? 0)} {Math.abs(r.days_left ?? 0) === 1 ? 'day' : 'days'} expired)</span>
                                                : <span className="text-amber-700">{r.expires_on} ({r.days_left} {r.days_left === 1 ? 'day' : 'days'} left)</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Dialog open={approving !== null} onOpenChange={(o) => !o && setApproving(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Approve {approving?.label}?</DialogTitle>
                        <DialogDescription>
                            {approving?.is_other ? 'The document will be added to the store.' : 'The file and date replace the store’s current permit. The old file is kept.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitApprove} className="space-y-4">
                        {approving?.has_expiry && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="approve_date">Valid until (correct it if it doesn't match the document)</Label>
                                <Input id="approve_date" type="date" max={max_date} value={approveForm.data.expires_at} onChange={(e) => approveForm.setData('expires_at', e.target.value)} />
                                <InputError message={approveForm.errors.expires_at} />
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setApproving(null)}>Cancel</Button>
                            <Button type="submit" disabled={approveForm.processing} className="gap-1.5 bg-green-600 text-white hover:bg-green-700">
                                {approveForm.processing && <Loader2 className="h-4 w-4 animate-spin" />} Approve
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reject {rejecting?.label}?</DialogTitle>
                        <DialogDescription>The store owner sees this reason and can upload again.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitReject} className="space-y-4">
                        <div className="grid gap-1.5">
                            <ReasonTextPicker
                                context="verification_reject"
                                reasonLabel="Reason"
                                value={rejectForm.data.reason}
                                onChange={(v) => rejectForm.setData('reason', v)}
                                maxLength={500}
                                rows={2}
                            />
                            <InputError message={rejectForm.errors.reason} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
                            <Button type="submit" disabled={rejectForm.processing || !rejectForm.data.reason.trim()} className="gap-1.5 bg-red-600 text-white hover:bg-red-700">
                                {rejectForm.processing && <Loader2 className="h-4 w-4 animate-spin" />} Reject
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
