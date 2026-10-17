import { useForm } from '@inertiajs/react';
import { Check, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type StaffDocumentRow = {
    id: number; doc_type: string; label: string; document_number: string | null; expires: string | null; expires_on: string | null;
    status: 'pending' | 'approved' | 'rejected'; reason: string | null; reviewer: string | null; date: string; url: string;
};

/** The rider's license status, worded for the store owner. */
const OWNER_LICENSE_TEXT: Record<string, string> = {
    valid:    'valid — this rider can make deliveries.',
    expiring: 'expires within 30 days — ask the rider to upload the renewed license.',
    pending:  'waiting for your approval below.',
    rejected: 'rejected — the rider needs to upload it again before making deliveries.',
    expired:  'expired — this rider cannot make deliveries until a renewed license is approved.',
    missing:  'not uploaded yet — this rider cannot make deliveries.',
};

const STATUS: Record<StaffDocumentRow['status'], [string, string]> = {
    pending:  ['bg-blue-100 text-blue-800', 'Waiting for approval'],
    approved: ['bg-green-100 text-green-800', 'Approved'],
    rejected: ['bg-red-100 text-red-800', 'Rejected'],
};

/** Store owner: documents a staff member / rider uploaded, with Approve / Reject for pending ones. */
export default function StaffDocumentsCard({ documents, license }: {
    documents: StaffDocumentRow[];
    license: { status: string; message: string } | null;
}) {
    const [approving, setApproving] = useState<StaffDocumentRow | null>(null);
    const [rejecting, setRejecting] = useState<StaffDocumentRow | null>(null);
    const approveForm = useForm({ expires_at: '' });
    const rejectForm = useForm({ reason: '' });

    const submitApprove = (e: FormEvent) => {
        e.preventDefault();
        if (approving) approveForm.post(`/seller/staff-documents/${approving.id}/approve`, { preserveScroll: true, onSuccess: () => setApproving(null) });
    };
    const submitReject = (e: FormEvent) => {
        e.preventDefault();
        if (rejecting) rejectForm.post(`/seller/staff-documents/${rejecting.id}/reject`, { preserveScroll: true, onSuccess: () => setRejecting(null) });
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-blue-600" /> Documents</CardTitle>
                {license && (
                    <p className={cn('text-sm', ['valid', 'expiring'].includes(license.status) ? 'text-green-700' : 'text-red-600')}>
                        Driver's license: {OWNER_LICENSE_TEXT[license.status] ?? license.status}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                {documents.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No documents uploaded yet.</p>
                ) : (
                    <ul className="divide-y text-sm">
                        {documents.map((d) => (
                            <li key={d.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">
                                        {d.label}
                                        <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS[d.status][0])}>{STATUS[d.status][1]}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Uploaded {d.date}
                                        {d.document_number ? ` · No. ${d.document_number}` : ''}
                                        {d.expires_on ? ` · valid until ${d.expires_on}` : ''}
                                        {d.reviewer ? ` · reviewed by ${d.reviewer}` : ''}
                                    </p>
                                    {d.status === 'rejected' && d.reason && <p className="text-xs text-red-600">Reason: {d.reason}</p>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <a href={d.url} target="_blank" rel="noopener"><Button size="sm" variant="outline" className="gap-1"><ExternalLink className="h-3.5 w-3.5" /> View</Button></a>
                                    {d.status === 'pending' && (
                                        <>
                                            <Button size="sm" className="gap-1 bg-green-600 text-white hover:bg-green-700"
                                                onClick={() => { approveForm.clearErrors(); approveForm.setData('expires_at', d.expires ?? ''); setApproving(d); }}>
                                                <Check className="h-3.5 w-3.5" /> Approve
                                            </Button>
                                            <Button size="sm" variant="outline" className="gap-1 text-red-600"
                                                onClick={() => { rejectForm.reset(); rejectForm.clearErrors(); setRejecting(d); }}>
                                                <X className="h-3.5 w-3.5" /> Reject
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>

            <Dialog open={approving !== null} onOpenChange={(o) => !o && setApproving(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Approve {approving?.label}?</DialogTitle>
                        <DialogDescription>Check that the file is clear and the details match.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitApprove} className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="sd_approve_date">Valid until{approving?.doc_type === 'drivers_license' ? '' : ' (optional)'} — correct it if it doesn't match</Label>
                            <Input id="sd_approve_date" type="date" value={approveForm.data.expires_at} onChange={(e) => approveForm.setData('expires_at', e.target.value)} />
                            <InputError message={approveForm.errors.expires_at} />
                        </div>
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
                        <DialogDescription>Your staff member sees this reason and can upload again.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitReject} className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="sd_reject_reason">Reason</Label>
                            <Input id="sd_reject_reason" value={rejectForm.data.reason} maxLength={500} placeholder="e.g. The photo is blurry" onChange={(e) => rejectForm.setData('reason', e.target.value)} />
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
        </Card>
    );
}
