import { router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Eye, FileSearch, Loader2, Send, ShieldCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ChoiceSelect } from '@/components/choice-select';
import type { OcrResult } from '@/components/document-auto-read';
import DocumentReviewViewer, { ReviewStatusChip, type ReviewItem } from '@/components/document-review-viewer';
import FaceMatchChip, { type FaceMatch } from '@/components/face-match-chip';
import StoreLocationMap from '@/components/store-location-map';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Decision = { status: 'accepted' | 'rejected' | null; reason: string | null; note: string | null; by_name: string | null; at: string | null; expires_at: string | null; auto: string | null };
type ReviewDoc = { key: string; label: string; url: string | null; is_pdf: boolean; needs_date: boolean; current_expires: string | null; required: boolean; submission_id: number | null; ocr_key: string; ocr: OcrResult; max_date?: string; /** J9: a branch reuses this from its main store */ inherited?: boolean };

/** StoreController::review() */
export type StoreReview = {
    documents: ReviewDoc[];
    decisions: Record<string, Decision>;
    blocker: string | null;
    rejected: { key: string; label: string; reason: string; note: string | null; text: string }[];
    reasons: string[];
    pin: { lat: number | null; lng: number | null; address: string };
    max_date: string;
    /** The owner entered the email code (no approval before) — K3 */
    owner_email_verified?: boolean;
};

/**
 * Admin store page (pending application): the documents to review — each opens in the viewer with Accept / Reject —
 * plus "Store address matches the map pin" and "Duplicate warnings checked". Approve when everything is accepted;
 * Send back to the seller when something is rejected (each rejected document is listed for them). J3.
 */
export default function StoreReviewCard({ storeId, storeName, review, ownerFace, ownerSelfieUrl, duplicateCount, ocr, canApprove }: {
    storeId: number;
    storeName: string;
    review: StoreReview;
    ownerFace: FaceMatch | null;
    ownerSelfieUrl: string | null;
    duplicateCount: number;
    ocr: { results: Record<string, OcrResult>; reading: string | null; readAgain: (key: string) => void; enabled: boolean };
    canApprove: boolean;
}) {
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<'approve' | 'send' | string | null>(null);
    const [confirmSend, setConfirmSend] = useState(false);
    const [itemReject, setItemReject] = useState<{ key: string; reason: string; note: string } | null>(null);

    const NONE: Decision = { status: null, reason: null, note: null, by_name: null, at: null, expires_at: null, auto: null };
    // The owner's ID was read while the page is open and the name doesn't match → no automatic acceptance any more
    // (the server applies the same rule from the saved auto-read when approving)
    const idNameMismatch = ocr.results.valid_id?.name_match === false;
    const decided = (key: string): Decision => {
        const d = review.decisions[key] ?? NONE;
        return key === 'valid_id' && d.auto && idNameMismatch ? NONE : d;
    };
    const blocker = review.blocker
        ?? (idNameMismatch && review.decisions.valid_id?.auto ? 'Check the Valid ID (owner): the name on it doesn\'t seem to match.' : null);

    const items: ReviewItem[] = review.documents.map((d) => {
        const dec = decided(d.key);
        return {
            key: d.key, label: d.label, url: d.url, is_pdf: d.is_pdf, needs_date: d.needs_date,
            status: d.inherited ? 'accepted' : dec.status, reason: dec.reason, note: d.inherited ? null : dec.note,
            // J9: a branch's ID / BIR / DTI-SEC come from the main store — read-only, already accepted
            auto: d.inherited ? 'From main store — already accepted' : dec.auto, by_name: dec.by_name, at: dec.at, locked: !!d.inherited,
            saved_date: dec.expires_at ?? d.current_expires, ocr_key: d.ocr_key, max_date: d.max_date,
            extra: d.key === 'valid_id' ? (
                <div className="space-y-1.5 rounded-md border p-2">
                    <p className="text-xs font-medium text-muted-foreground">Live selfie (taken at registration)</p>
                    {ownerSelfieUrl
                        ? <a href={ownerSelfieUrl} target="_blank" rel="noopener noreferrer"><img src={ownerSelfieUrl} alt="Owner selfie" className="max-h-48 w-full rounded border object-contain" /></a>
                        : <p className="text-xs text-muted-foreground">No selfie.</p>}
                    {ownerFace && <FaceMatchChip face={ownerFace} />}
                </div>
            ) : undefined,
        };
    });

    const post = (url: string, data: Record<string, string>, key: string) => {
        setBusy(key);
        router.post(url, data, { preserveScroll: true, onFinish: () => setBusy(null) });
    };
    const approve = () => {
        setBusy('approve');
        router.patch(`/admin/stores/${storeId}/approve`, { note }, { preserveScroll: true, onFinish: () => setBusy(null) });
    };
    const sendBack = () => {
        setBusy('send');
        router.post(`/admin/stores/${storeId}/send-back`, { note }, { preserveScroll: true, onFinish: () => { setBusy(null); setConfirmSend(false); } });
    };

    const docsDone = items.filter((i) => i.status === 'accepted').length;

    /** Accept / Reject buttons for the two non-document items */
    const itemActions = (k: string) => {
        const dec = decided(k);
        if (!canApprove) return null;
        if (itemReject?.key === k) {
            return (
                <div className="mt-2 grid gap-2 rounded-md border border-red-200 p-2 dark:border-red-900">
                    <ChoiceSelect label="Reason" value={itemReject.reason} onValueChange={(v) => setItemReject({ ...itemReject, reason: v })} placeholder="Choose a reason"
                        groups={[{ items: review.reasons.map((r) => ({ value: r, label: r })) }]} />
                    <textarea rows={2} maxLength={300} value={itemReject.note} onChange={(e) => setItemReject({ ...itemReject, note: e.target.value })}
                        placeholder="Note for the seller (e.g. the pin is on another street)" aria-label="Note for the seller"
                        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setItemReject(null)}>Back</Button>
                        <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" disabled={!itemReject.reason || (itemReject.reason === 'Other' && !itemReject.note.trim()) || busy === k}
                            onClick={() => { post(`/admin/stores/${storeId}/review/${k}`, { decision: 'reject', reason: itemReject.reason, note: itemReject.note.trim() }, k); setItemReject(null); }}>
                            Reject
                        </Button>
                    </div>
                </div>
            );
        }
        return (
            <div className="mt-2 flex flex-wrap gap-2">
                {dec.status !== 'accepted' && (
                    <Button size="sm" className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700" disabled={busy === k}
                        onClick={() => post(`/admin/stores/${storeId}/review/${k}`, { decision: 'accept' }, k)}>
                        {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Accept
                    </Button>
                )}
                {dec.status !== 'rejected' && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" onClick={() => setItemReject({ key: k, reason: '', note: '' })}>
                        <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                )}
            </div>
        );
    };

    return (
        <Card id="store-review" className="scroll-mt-20 border-green-200 dark:border-green-900">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-green-600" /> Review the application</CardTitle>
                <p className="text-xs text-muted-foreground">
                    Open each document, then Accept or Reject it — every decision is saved at once and ticks its line below.
                    {' '}{docsDone} of {items.length} documents accepted.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Documents to review = the checklist */}
                <ul className="divide-y rounded-md border" aria-label="Documents to review">
                    {items.map((i) => (
                        <li key={i.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                            <span className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                                {i.status === 'accepted' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Accepted" />
                                    : i.status === 'rejected' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Rejected" />
                                    : <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-border" aria-label="Not reviewed" />}
                                <span className="min-w-0">
                                    <span className="font-medium">{i.label}</span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <ReviewStatusChip item={i} />
                                        {i.key === 'valid_id' && ownerFace && i.status !== 'accepted' && <FaceMatchChip face={ownerFace} />}
                                        {i.needs_date && i.saved_date && i.status === 'accepted' && <span className="text-xs text-muted-foreground">valid until {i.saved_date}</span>}
                                    </span>
                                </span>
                            </span>
                            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1" onClick={() => setOpenKey(i.key)}>
                                <Eye className="h-3.5 w-3.5" /> View
                            </Button>
                        </li>
                    ))}

                    {/* Address vs pin */}
                    <li className="px-3 py-2.5 text-sm">
                        <ItemHead dec={decided('address_pin')} label="Store address matches the map pin" />
                        <p className="mt-1 text-xs text-muted-foreground">Typed address: <span className="text-foreground">{review.pin.address || '—'}</span></p>
                        <div className="mt-2 overflow-hidden rounded-md border">
                            <StoreLocationMap storeName={storeName} lat={review.pin.lat} lng={review.pin.lng} address={review.pin.address} height={180} />
                        </div>
                        {itemActions('address_pin')}
                    </li>

                    {/* Duplicates */}
                    <li className="px-3 py-2.5 text-sm">
                        <ItemHead dec={decided('duplicates')} label="Duplicate warnings checked (or none)" />
                        <p className="mt-1 text-xs text-muted-foreground">
                            {duplicateCount > 0 ? <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300"><AlertTriangle className="h-3 w-3" /> {duplicateCount} possible duplicate{duplicateCount > 1 ? 's' : ''} — see the red box above.</span> : 'No duplicate warnings.'}
                        </p>
                        {duplicateCount > 0 && itemActions('duplicates')}
                    </li>
                </ul>

                {review.owner_email_verified === false && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Owner hasn't verified their email yet. You can review the documents, but the store can be approved only after they enter the email code.</span>
                    </div>
                )}

                {review.rejected.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        <p className="font-medium">The seller will be asked to fix:</p>
                        <ul className="mt-1 list-inside list-disc text-xs">{review.rejected.map((r) => <li key={r.key}>{r.text}</li>)}</ul>
                    </div>
                )}

                {canApprove && (
                    <>
                        <div className="grid gap-1">
                            <label htmlFor="approve-note" className="text-xs font-medium text-muted-foreground">Note (optional — saved with the approval, or added to the message when sending back)</label>
                            <textarea id="approve-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                                placeholder="e.g. Called the owner to confirm the address."
                                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {blocker && <span className="mr-auto text-xs text-muted-foreground">{blocker}</span>}
                            <Button variant="outline" disabled={review.rejected.length === 0 || busy !== null} onClick={() => setConfirmSend(true)}
                                className="gap-1.5 border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                                <Send className="h-4 w-4" /> Send back to seller
                            </Button>
                            <Button onClick={approve} disabled={!!blocker || busy !== null} className="gap-1.5 bg-green-600 text-white hover:bg-green-700">
                                {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve store
                            </Button>
                        </div>
                    </>
                )}
                {!canApprove && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileSearch className="h-3.5 w-3.5" /> You can view the documents; approving needs the Verifications permission.</p>}
            </CardContent>

            <DocumentReviewViewer
                items={items} openKey={openKey} onOpenKey={setOpenKey} reasons={review.reasons} maxDate={review.max_date} ocr={ocr}
                title={`${storeName} — application`}
                actions={{
                    accept: (i, date) => ({ url: `/admin/stores/${storeId}/review/${i.key}`, data: { decision: 'accept', ...(i.needs_date ? { expires_at: date } : {}) } }),
                    reject: (i, reason, n) => ({ url: `/admin/stores/${storeId}/review/${i.key}`, data: { decision: 'reject', reason, note: n } }),
                    undo:   (i) => ({ url: `/admin/stores/${storeId}/review/${i.key}`, data: { decision: 'undo' } }),
                }}
            />

            <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Send the application back?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>{storeName} will be asked to re-upload:</p>
                                <ul className="list-inside list-disc">{review.rejected.map((r) => <li key={r.key}>{r.text}</li>)}</ul>
                                <p>Accepted documents stay accepted.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy === 'send'}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); sendBack(); }} disabled={busy === 'send'} className="bg-red-600 hover:bg-red-700">
                            {busy === 'send' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Send back
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function ItemHead({ dec, label }: { dec: Decision; label: string }) {
    return (
        <span className="flex items-start gap-2">
            {dec.status === 'accepted' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                : dec.status === 'rejected' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                : <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-border" />}
            <span className="min-w-0">
                <span className="font-medium">{label}</span>
                <span className="mt-0.5 block"><ReviewStatusChip item={dec} /></span>
            </span>
        </span>
    );
}
