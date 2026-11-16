import { router } from '@inertiajs/react';
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, RotateCcw, XCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChoiceSelect } from '@/components/choice-select';
import { AUTO_READ_DISCLAIMER, AutoReadLine, type OcrResult } from '@/components/document-auto-read';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** One document in the review (store application or a renewal). */
export type ReviewItem = {
    key: string;
    label: string;
    url: string | null;
    is_pdf: boolean;
    /** Business / Mayor's Permit, FSIC, DOE LTO, DTI certificate: Accept needs the "valid until" date */
    needs_date: boolean;
    status: 'accepted' | 'rejected' | null;
    reason?: string | null;
    note?: string | null;
    /** "Accepted automatically — face match 95%" */
    auto?: string | null;
    by_name?: string | null;
    at?: string | null;
    /** Already confirmed date (Y-m-d) */
    saved_date?: string | null;
    /** Latest allowed "valid until" for this document (Business Permit / FSIC: 2 years; DOE / DTI: 6 years) */
    max_date?: string | null;
    ocr_key?: string | null;
    /** Shown next to the document (e.g. the live selfie + face chip for the valid ID) */
    extra?: ReactNode;
    /** Renewals: Accept / Reject only while pending */
    locked?: boolean;
};

export type ReviewActions = {
    /** POST url + body for Accept / Reject / Undo (Inertia, preserveScroll) */
    accept: (item: ReviewItem, date: string) => { url: string; data: Record<string, string> };
    reject: (item: ReviewItem, reason: string, note: string) => { url: string; data: Record<string, string> };
    undo?: (item: ReviewItem) => { url: string; data: Record<string, string> };
};

/** "Not reviewed" / "Accepted" / "Accepted automatically — …" / "Rejected — reason" */
export function ReviewStatusChip({ item, className }: { item: Pick<ReviewItem, 'status' | 'reason' | 'note' | 'auto'>; className?: string }) {
    const [tone, text] = item.status === 'accepted'
        ? ['bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300', item.auto ?? 'Accepted']
        : item.status === 'rejected'
            ? ['bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', `Rejected — ${item.reason ?? ''}${item.note ? ` (${item.note})` : ''}`]
            : ['bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', 'Not reviewed'];
    return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone, className)}>{text}</span>;
}

/**
 * Large document viewer with Accept / Reject (J3). Image zoomable, PDF embedded, this document's auto-read box,
 * a "Valid until" date for the 4 expiring documents (pre-filled from OCR), Previous / Next, and after a decision it
 * moves to the next document that isn't reviewed yet. Each decision is saved at once by the caller's endpoint.
 */
export default function DocumentReviewViewer({ items, openKey, onOpenKey, reasons, maxDate, actions, ocr, title = 'Review document' }: {
    items: ReviewItem[];
    openKey: string | null;
    onOpenKey: (key: string | null) => void;
    reasons: string[];
    maxDate: string;
    actions: ReviewActions;
    ocr: { results: Record<string, OcrResult>; reading: string | null; readAgain: (key: string) => void; enabled: boolean };
    title?: string;
}) {
    const index = items.findIndex((i) => i.key === openKey);
    const item = index >= 0 ? items[index] : null;
    const result = item?.ocr_key ? (ocr.results[item.ocr_key] ?? null) : null;
    const ocrDate = (result as (OcrResult & { likely_expiry_iso?: string | null }) | null)?.likely_expiry_iso ?? null;

    const [zoom, setZoom] = useState(1);
    const [mode, setMode] = useState<'view' | 'reject'>('view');
    const [date, setDate] = useState('');
    const [dateSource, setDateSource] = useState<'saved' | 'ocr' | 'typed' | 'none'>('none');
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Where to go after a decision (set before the request; the item list refreshes afterwards)
    const after = useRef<string | null | undefined>(undefined);

    // A different document: reset the form; date = confirmed date, else what OCR read, else empty
    useEffect(() => {
        setZoom(1); setMode('view'); setReason(''); setNote(''); setErrors({});
        if (item?.saved_date) { setDate(item.saved_date); setDateSource('saved'); }
        else if (ocrDate) { setDate(ocrDate); setDateSource('ocr'); }
        else { setDate(''); setDateSource('none'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openKey]);

    // OCR finished while the viewer is open and nothing was typed yet → pre-fill
    useEffect(() => {
        if (ocrDate && dateSource === 'none' && !date) { setDate(ocrDate); setDateSource('ocr'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ocrDate]);

    // After the decision is saved and the list refreshed: next document still to review (or close)
    useEffect(() => {
        if (after.current === undefined || busy) return;
        const target = after.current;
        after.current = undefined;
        onOpenKey(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, busy]);

    const nextUnreviewed = useMemo(() => () => {
        if (index < 0) return null;
        const order = [...items.slice(index + 1), ...items.slice(0, index)];
        return order.find((i) => i.status === null && !i.locked)?.key ?? null;
    }, [items, index]);

    function send(req: { url: string; data: Record<string, string> }, next: string | null | undefined) {
        setBusy(true);
        setErrors({});
        router.post(req.url, req.data, {
            preserveScroll: true,
            onSuccess: () => { after.current = next; },
            onError: (e) => setErrors(e as Record<string, string>),
            onFinish: () => setBusy(false),
        });
    }

    if (!item) return null;

    const accept = () => send(actions.accept(item, date), nextUnreviewed());
    const reject = () => send(actions.reject(item, reason, note.trim()), nextUnreviewed());
    const go = (d: number) => onOpenKey(items[(index + d + items.length) % items.length].key);

    return (
        <Dialog open={!!item} onOpenChange={(o) => !o && onOpenKey(null)}>
            <DialogContent className="sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                        {item.label} <ReviewStatusChip item={item} />
                    </DialogTitle>
                    <DialogDescription>
                        {title} · {index + 1} of {items.length}
                        {item.by_name && item.at ? ` · last decision by ${item.by_name}, ${item.at}` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    {/* The document */}
                    <div className="min-w-0 space-y-2">
                        {!item.url ? (
                            <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No file.</p>
                        ) : item.is_pdf ? (
                            <iframe src={item.url} title={item.label} className="h-[55dvh] w-full rounded-md border bg-white" />
                        ) : (
                            <div className="h-[55dvh] overflow-auto rounded-md border bg-gray-50 dark:bg-gray-900">
                                <img src={item.url} alt={item.label} draggable={false}
                                    onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
                                    style={{ width: zoom === 1 ? '100%' : `${zoom * 100}%`, maxWidth: 'none' }}
                                    className={cn('block h-auto object-contain', zoom === 1 ? 'max-h-full cursor-zoom-in' : 'cursor-zoom-out')} />
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            {item.url && !item.is_pdf && (
                                <>
                                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1}><ZoomOut className="h-3.5 w-3.5" /> Zoom out</Button>
                                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4}><ZoomIn className="h-3.5 w-3.5" /> Zoom in</Button>
                                </>
                            )}
                            {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">Open in a new tab <ExternalLink className="h-3 w-3" /></a>}
                        </div>
                    </div>

                    {/* Auto-read + decision */}
                    <div className="min-w-0 space-y-3">
                        {item.extra}
                        {item.ocr_key && (
                            <div>
                                <AutoReadLine result={result} reading={ocr.reading === item.ocr_key} enabled={ocr.enabled} onReadAgain={() => ocr.readAgain(item.ocr_key!)} />
                                <p className="mt-1 text-[11px] italic text-muted-foreground">{AUTO_READ_DISCLAIMER}</p>
                            </div>
                        )}

                        {!item.locked && mode === 'view' && (
                            <>
                                {item.needs_date && (
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="rv_date">Valid until</Label>
                                        <Input id="rv_date" type="date" max={item.max_date ?? maxDate} value={date}
                                            onChange={(e) => { setDate(e.target.value); setDateSource('typed'); }} />
                                        <p className={cn('text-xs', dateSource === 'none' && !date ? 'text-amber-700' : 'text-muted-foreground')}>
                                            {dateSource === 'ocr' ? 'Read automatically — check it against the document.'
                                                : dateSource === 'saved' ? 'Confirmed earlier — change it if needed.'
                                                : date ? 'Typed by you.' : "Couldn't read the date — type it from the document."}
                                        </p>
                                        <InputError message={errors.expires_at} />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" onClick={accept} disabled={busy || (item.needs_date && !date)} className="flex-1 gap-1.5 bg-green-600 text-white hover:bg-green-700">
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => setMode('reject')} disabled={busy} className="flex-1 gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
                                        <XCircle className="h-4 w-4" /> Reject
                                    </Button>
                                </div>
                                {item.status && actions.undo && (
                                    <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" disabled={busy}
                                        onClick={() => send(actions.undo!(item), item.key)}>
                                        <RotateCcw className="h-3 w-3" /> Back to Not reviewed
                                    </button>
                                )}
                            </>
                        )}

                        {!item.locked && mode === 'reject' && (
                            <div className="space-y-3 rounded-md border border-red-200 p-3 dark:border-red-900">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="rv_reason">Why is it rejected? <span className="text-red-500">*</span></Label>
                                    <ChoiceSelect id="rv_reason" label="Reason" value={reason} onValueChange={setReason} placeholder="Choose a reason"
                                        groups={[{ items: reasons.map((r) => ({ value: r, label: r })) }]} />
                                    <InputError message={errors.reason} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="rv_note">Note for the seller {reason === 'Other' ? <span className="text-red-500">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
                                    <textarea id="rv_note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                                        placeholder="e.g. The permit shown is for 2024."
                                        className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                                    <InputError message={errors.note} />
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => setMode('view')} disabled={busy}>Back</Button>
                                    <Button type="button" onClick={reject} disabled={busy || !reason || (reason === 'Other' && !note.trim())} className="flex-1 gap-1.5 bg-red-600 text-white hover:bg-red-700">
                                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reject document
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => go(-1)} disabled={items.length < 2}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
                    <span className="text-xs text-muted-foreground">{items.filter((i) => i.status === null && !i.locked).length} not reviewed</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => go(1)} disabled={items.length < 2}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
