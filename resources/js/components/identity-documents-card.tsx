import { Link, useForm } from '@inertiajs/react';
import { Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import DocumentRow, { DocumentHeading, DocumentLink } from '@/components/document-row';
import { IdCheckHints, IdDocumentTile } from '@/components/id-document-viewer';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type Identity = {
    status: 'verified' | 'pending' | 'rejected' | 'not_submitted';
    verified_at: string | null;
    verified_by: string | null;
    rejection_reason: string | null;
    full_name: string;
    phone: string | null;
    email: string;
    email_verified: boolean;
    home_address: string | null;
    saved_addresses: number;
    valid_id_url: string | null;
    selfie_url: string | null;
    store_id: number | null;
    can_revoke: boolean;
    history: { id: number; date: string; type: string; status: string; reviewer: string | null; reason: string | null }[];
    staff_documents: { id: number; label: string; document_number: string | null; expires_on: string | null; status: string; url: string }[];
};

const STATUS: Record<Identity['status'], [string, string]> = {
    verified:      ['bg-green-100 text-green-800', 'Verified'],
    pending:       ['bg-blue-100 text-blue-800', 'Waiting for review'],
    rejected:      ['bg-red-100 text-red-800', 'Rejected'],
    not_submitted: ['bg-gray-100 text-gray-700', 'Not submitted'],
};

const statusText = (s: string) => ({ approved: 'Approved', rejected: 'Rejected', pending: 'Waiting' } as Record<string, string>)[s] ?? s;

/** Admin user page: the person's identity, ID + selfie (private), verification history and documents. */
export default function IdentityDocumentsCard({ userId, identity: id }: { userId: number; identity: Identity }) {
    const [revoking, setRevoking] = useState(false);
    const form = useForm({ reason: '' });

    function submit(e: FormEvent) {
        e.preventDefault();
        form.patch(`/admin/users/${userId}/revoke-verification`, { preserveScroll: true, onSuccess: () => { setRevoking(false); form.reset(); } });
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Identity &amp; documents
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[id.status][0])}>{STATUS[id.status][1]}</span>
                    {id.status === 'verified' && id.can_revoke && (
                        <Button size="sm" variant="outline" className="ml-auto gap-1.5 text-red-600" onClick={() => setRevoking(true)}>
                            <ShieldX className="h-3.5 w-3.5" /> Revoke verification
                        </Button>
                    )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    {id.status === 'verified' && `Verified${id.verified_at ? ` on ${id.verified_at}` : ''}${id.verified_by ? ` by ${id.verified_by}` : ''}.`}
                    {id.status === 'pending' && 'An ID is waiting for review in Verifications.'}
                    {id.status === 'rejected' && `Rejected${id.rejection_reason ? `: ${id.rejection_reason}` : '.'}`}
                    {id.status === 'not_submitted' && 'This person has not uploaded an ID yet.'}
                </p>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    <p><span className="text-muted-foreground">Full name:</span> <span className="font-medium">{id.full_name}</span></p>
                    <p><span className="text-muted-foreground">Phone:</span> {id.phone || '—'}</p>
                    <p>
                        <span className="text-muted-foreground">Email:</span> {id.email}
                        {id.email_verified && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">verified</span>}
                    </p>
                    <p><span className="text-muted-foreground">Saved delivery addresses:</span> {id.saved_addresses}</p>
                    <p className="sm:col-span-2"><span className="text-muted-foreground">Home address:</span> {id.home_address || '—'}</p>
                </div>

                <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <IdDocumentTile url={id.valid_id_url} label="Valid ID" />
                        <IdDocumentTile url={id.selfie_url} label="Selfie" />
                    </div>
                    {(id.valid_id_url || id.selfie_url) && <IdCheckHints />}
                </div>

                {id.store_id && (
                    <p className="text-sm">
                        Store permits are on the store page: <Link href={`/admin/stores/${id.store_id}`} className="font-medium text-blue-600 hover:underline">Store documents</Link>
                    </p>
                )}

                {id.staff_documents.length > 0 && (
                    <div className="space-y-2">
                        <DocumentHeading>Staff documents</DocumentHeading>
                        <div className="divide-y rounded-md border px-3">
                            {id.staff_documents.map((d) => (
                                <DocumentRow key={d.id} className="py-2"
                                    label={<>{d.label}{d.document_number ? ` · No. ${d.document_number}` : ''}{d.expires_on ? ` · valid until ${d.expires_on}` : ''}</>}>
                                    <span className="text-xs text-muted-foreground">{statusText(d.status)}</span>
                                    <DocumentLink url={d.url} />
                                </DocumentRow>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <DocumentHeading>Verification history</DocumentHeading>
                    {id.history.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No verification requests yet.</p>
                    ) : (
                        <ul className="divide-y rounded-md border px-3 text-sm">
                            {id.history.map((h) => (
                                <li key={h.id} className="py-2">
                                    <span className="font-medium">{h.type}</span>
                                    <span className="text-muted-foreground"> · {h.date} · </span>
                                    <span className={h.status === 'rejected' ? 'text-red-600' : h.status === 'approved' ? 'text-green-700' : ''}>{statusText(h.status)}</span>
                                    {h.reviewer && <span className="text-muted-foreground"> · by {h.reviewer}</span>}
                                    {h.reason && <span className="block text-xs text-muted-foreground">Reason: {h.reason}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>

            <Dialog open={revoking} onOpenChange={setRevoking}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Revoke ID verification?</DialogTitle>
                        <DialogDescription>They will have to upload their ID again before they can order. They will see your reason.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="revoke_reason">Reason</Label>
                            <textarea id="revoke_reason" rows={3} maxLength={255} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)}
                                placeholder="e.g. The ID photo is blurry — please upload a clearer one."
                                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
                            <InputError message={form.errors.reason} />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setRevoking(false)}>Cancel</Button>
                            <Button type="submit" disabled={form.processing || !form.data.reason.trim()} className="gap-1.5 bg-red-600 text-white hover:bg-red-700">
                                {form.processing && <Loader2 className="h-4 w-4 animate-spin" />} Revoke
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
