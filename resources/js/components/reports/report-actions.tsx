import { Link, router, useForm } from '@inertiajs/react';
import { BellRing, CheckCircle2, ImagePlus, Loader2, RotateCcw, Search, Send, ShieldAlert, Store, X, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { relativeTime } from '@/components/chat/format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import ReportQuickReplies from './quick-replies';
import type { ReportDetail, ReportPortal } from './types';

const textareaCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const ordinal = (n: number) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

/** Everything the viewer can do on a report, driven by the backend's flags. */
export default function ReportActions({ report }: { report: ReportDetail; portal: ReportPortal }) {
    const base = report.link;   // this report's URL in the viewer's portal; actions are sub-paths
    const f = report.flags;
    const [dialog, setDialog] = useState<null | 'investigate' | 'propose' | 'not_solved' | 'escalate' | 'hand' | 'close'>(null);
    const remindedRecently = !!f.reminded_at && Date.now() - new Date(f.reminded_at).getTime() < 3600_000;

    return (
        <div className="space-y-4">
            {/* Reporter: a resolution was proposed */}
            {f.can_confirm && (
                <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:bg-purple-900/20">
                    <p className="text-sm font-semibold">A solution was proposed. Is your problem solved?</p>
                    {report.resolution && <p className="text-sm">{report.resolution}</p>}
                    {report.resolution_photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {report.resolution_photos.map((u) => (
                                <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Resolution photo" className="h-20 w-20 rounded-md border object-cover" /></a>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => router.post(`${base}/confirm`, {}, { preserveScroll: true })}>
                            <CheckCircle2 className="h-4 w-4" /> Yes, it's solved
                        </Button>
                        {f.can_not_solved && (
                            <Button variant="outline" className="flex-1 gap-1.5 border-orange-300 text-orange-700" onClick={() => setDialog('not_solved')}>
                                <XCircle className="h-4 w-4" /> Not solved
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {f.can_request_refund && report.order && (
                <Link href={`/customer/orders/${report.order.id}?refund=1`}>
                    <Button variant="outline" className="w-full gap-1.5 sm:w-auto"><RotateCcw className="h-4 w-4" /> Request a refund</Button>
                </Link>
            )}

            {/* Handler: status steps */}
            {(f.can_start_review || f.can_start_investigating || f.can_propose_resolution) && (
                <div className="flex flex-wrap gap-2 rounded-lg border bg-gray-50 p-3 dark:bg-gray-900/40">
                    <span className="w-full text-xs font-semibold uppercase tracking-wide text-gray-500">Update status</span>
                    {f.can_start_review && (
                        <Button size="sm" variant="outline" onClick={() => router.post(`${base}/start-review`, {}, { preserveScroll: true })}>Start review</Button>
                    )}
                    {f.can_start_investigating && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog('investigate')}><Search className="h-3.5 w-3.5" /> Start investigating</Button>
                    )}
                    {f.can_propose_resolution && (
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialog('propose')}><CheckCircle2 className="h-3.5 w-3.5" /> Propose resolution</Button>
                    )}
                </div>
            )}

            {f.can_reply && <ReplyBox base={base} allowInternal={f.can_add_internal_note} quickReplies={report.quick_replies} />}

            {/* Admin + secondary actions */}
            <div className="flex flex-wrap items-center gap-2">
                {f.can_remind_store && (
                    <Button variant="outline" className="gap-1.5" disabled={remindedRecently}
                        onClick={() => router.post(`${base}/remind-store`, {}, { preserveScroll: true })}>
                        <BellRing className="h-4 w-4" /> Remind the store
                    </Button>
                )}
                {f.can_remind_store && f.reminded_at && (
                    <span className="text-xs text-gray-500">Reminded {relativeTime(f.reminded_at) === 'now' ? 'just now' : `${relativeTime(f.reminded_at)} ago`}</span>
                )}
                {f.can_hand_to_store && (
                    <Button variant="outline" className="gap-1.5" onClick={() => setDialog('hand')}><Store className="h-4 w-4" /> Send to store to fix</Button>
                )}
                {f.can_close && (
                    <Button className="gap-1.5" onClick={() => setDialog('close')}><CheckCircle2 className="h-4 w-4" /> Close report</Button>
                )}
                {f.can_escalate && (
                    <button type="button" onClick={() => setDialog('escalate')} className="text-sm font-medium text-orange-700 underline">Send to admin</button>
                )}
                {f.can_withdraw && (
                    <button type="button" onClick={() => { if (confirm('Withdraw this report?')) router.post(`${base}/withdraw`, {}, { preserveScroll: true }); }}
                        className="text-sm text-gray-500 underline">Withdraw report</button>
                )}
            </div>

            {/* Dialogs */}
            <TextDialog open={dialog === 'investigate'} onClose={() => setDialog(null)} title="Start investigating"
                label="Note for the reporter (optional)" field="note" url={`${base}/start-investigating`} submit="Start investigating" optional max={1000} />
            <ProposeDialog open={dialog === 'propose'} onClose={() => setDialog(null)} url={`${base}/propose-resolution`} needsPhoto={f.proposal_needs_photo} />
            <TextDialog open={dialog === 'not_solved'} onClose={() => setDialog(null)} title="Not solved"
                label="What is still wrong?" field="reason" url={`${base}/not-solved`} submit="Send" max={1000}
                note={report.route !== 'admin' && !report.escalated && !report.is_system ? 'We will also send your report to the platform admin.' : undefined} />
            <TextDialog open={dialog === 'escalate'} onClose={() => setDialog(null)} title="Send to the platform admin"
                label="What is still wrong?" field="reason" url={`${base}/escalate`} submit="Send to admin" max={1000} />
            <ConfirmDialog open={dialog === 'hand'} onClose={() => setDialog(null)} title="Send to the store to fix?"
                body="The store will see this report and who filed it. Continue?" url={`${base}/hand-to-store`} submit="Yes, send to the store" />
            {report.admin && <CloseDialog open={dialog === 'close'} onClose={() => setDialog(null)} report={report} url={`${base}/close`} />}
        </div>
    );
}

function ReplyBox({ base, allowInternal, quickReplies }: { base: string; allowInternal: boolean; quickReplies: ReportDetail['quick_replies'] }) {
    const form = useForm<{ body: string; images: File[]; internal: boolean }>({ body: '', images: [], internal: false });
    const errors = form.errors as Record<string, string | undefined>;

    function submit(e: FormEvent) {
        e.preventDefault();
        form.post(`${base}/reply`, { forceFormData: true, preserveScroll: true, onSuccess: () => form.reset() });
    }

    return (
        <form onSubmit={submit} className="space-y-2 rounded-lg border p-3">
            <ReportQuickReplies groups={quickReplies} onPick={(t) => form.setData('body', form.data.body.trim() ? `${form.data.body.trimEnd()} ${t}` : t)} />
            <textarea value={form.data.body} onChange={(e) => form.setData('body', e.target.value)} rows={3} maxLength={2000}
                placeholder={form.data.internal ? 'Private note (only admins can see this)…' : 'Write a reply…'} className={textareaCls} aria-label="Reply" />
            {form.data.images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {form.data.images.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                            {file.name}
                            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => form.setData('images', form.data.images.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                </div>
            )}
            {(errors.body || Object.entries(errors).find(([k]) => k.startsWith('images'))?.[1]) && (
                <p className="text-xs text-red-600">{errors.body ?? Object.entries(errors).find(([k]) => k.startsWith('images'))?.[1]}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-gray-600">
                    <ImagePlus className="h-4 w-4" /> Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                        onChange={(e) => { form.setData('images', [...form.data.images, ...Array.from(e.target.files ?? [])].slice(0, 3)); e.target.value = ''; }} />
                </label>
                {allowInternal && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
                        <Checkbox checked={form.data.internal} onCheckedChange={(c) => form.setData('internal', c === true)} /> Private note
                    </label>
                )}
                <Button type="submit" size="sm" className="ml-auto gap-1.5" disabled={form.processing || (!form.data.body.trim() && !form.data.images.length)}>
                    {form.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {form.data.internal ? 'Add note' : 'Send'}
                </Button>
            </div>
        </form>
    );
}

function ProposeDialog({ open, onClose, url, needsPhoto }: { open: boolean; onClose: () => void; url: string; needsPhoto: boolean }) {
    const form = useForm<{ note: string; photos: File[] }>({ note: '', photos: [] });
    const errors = form.errors as Record<string, string | undefined>;
    const photoError = Object.entries(errors).find(([k]) => k.startsWith('photos'))?.[1];

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { form.reset(); form.clearErrors(); onClose(); } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Propose resolution</DialogTitle>
                    <DialogDescription>We'll ask the reporter to confirm. If they don't reply within 3 days, the report closes.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); form.post(url, { forceFormData: true, preserveScroll: true, onSuccess: () => { form.reset(); onClose(); } }); }} className="space-y-3">
                    <label className="grid gap-1.5 text-sm">
                        What was done to solve it?
                        <textarea value={form.data.note} onChange={(e) => form.setData('note', e.target.value)} rows={4} maxLength={1000} className={textareaCls} autoFocus />
                    </label>
                    {errors.note && <p className="text-xs text-red-600">{errors.note}</p>}
                    <div className="space-y-1.5 text-sm">
                        <p>Photos {needsPhoto ? <span className="text-red-600">(required — show the fix)</span> : '(optional)'}, up to 3</p>
                        <div className="flex flex-wrap gap-2">
                            {form.data.photos.map((file, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                                    {file.name}
                                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => form.setData('photos', form.data.photos.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                                </span>
                            ))}
                            {form.data.photos.length < 3 && (
                                <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed px-2 py-1 text-xs text-gray-600">
                                    <ImagePlus className="h-3.5 w-3.5" /> Add photo
                                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                                        onChange={(e) => { form.setData('photos', [...form.data.photos, ...Array.from(e.target.files ?? [])].slice(0, 3)); e.target.value = ''; }} />
                                </label>
                            )}
                        </div>
                        {photoError && <p className="text-xs text-red-600">{photoError}</p>}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={form.processing || !form.data.note.trim() || (needsPhoto && form.data.photos.length === 0)}>
                            {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send resolution
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function CloseDialog({ open, onClose, report, url }: { open: boolean; onClose: () => void; report: ReportDetail; url: string }) {
    const a = report.admin!;
    const form = useForm<{ outcome: string; reason: string; safety_note: string }>({ outcome: '', reason: '', safety_note: '' });
    const errors = form.errors as Record<string, string | undefined>;
    const p = a.close_preview;

    let effect: string | null = null;
    if (form.data.outcome === 'false_report' && p) {
        const n = p.next_false_count;
        effect = n === 1 ? `This will be warning 1 of 3 for ${p.reporter_name}.`
            : n === 2 ? `This will be the final warning (2 of 3) for ${p.reporter_name}.`
            : p.is_customer_role
                ? `This will be ${p.reporter_name}'s ${ordinal(n)} false report. Their account will be suspended.${n > 3 ? ' (This account was reactivated before; one more false report suspends it again.)' : ''}`
                : `This will be ${p.reporter_name}'s ${ordinal(n)} false report. Admins will be asked to review their account.`;
    } else if (form.data.outcome === 'false_report' && report.reporter_side !== 'customer') {
        effect = 'The store will get a warning for filing a false report.';
    } else if (['store_at_fault', 'rider_at_fault'].includes(form.data.outcome)) {
        effect = 'The store will get a warning. Stores are never suspended automatically.';
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { form.reset(); form.clearErrors(); onClose(); } }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Close report</DialogTitle>
                    <DialogDescription>Choose the outcome. Both sides will see the reason.</DialogDescription>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); form.post(url, { preserveScroll: true, onSuccess: () => { form.reset(); onClose(); } }); }} className="space-y-3">
                    <div className="grid gap-1.5" role="radiogroup" aria-label="Outcome">
                        {a.close_outcomes.map((o) => (
                            <button key={o.key} type="button" role="radio" aria-checked={form.data.outcome === o.key} onClick={() => form.setData('outcome', o.key)}
                                className={cn('rounded-md border px-3 py-2 text-left text-sm', form.data.outcome === o.key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20' : 'hover:bg-gray-50')}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                    {errors.outcome && <p className="text-xs text-red-600">{errors.outcome}</p>}
                    {effect && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{effect}</p>}
                    <label className="grid gap-1.5 text-sm">
                        Reason (at least 10 characters)
                        <textarea value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} rows={3} maxLength={2000} className={textareaCls} />
                    </label>
                    {errors.reason && <p className="text-xs text-red-600">{errors.reason}</p>}
                    {report.flags.needs_safety_note && (
                        <label className="grid gap-1.5 text-sm">
                            <span className="flex items-center gap-1 font-medium text-red-700"><ShieldAlert className="h-4 w-4" /> Safety note (required)</span>
                            <span className="text-xs text-gray-500">The store hasn't sent a fix with photos. What was confirmed about the tank's safety, and with whom?</span>
                            <textarea value={form.data.safety_note} onChange={(e) => form.setData('safety_note', e.target.value)} rows={3} maxLength={1000} className={textareaCls} />
                        </label>
                    )}
                    {errors.safety_note && <p className="text-xs text-red-600">{errors.safety_note}</p>}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={form.processing || !form.data.outcome || form.data.reason.trim().length < 10
                            || (report.flags.needs_safety_note && form.data.safety_note.trim().length < 10)}>
                            {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Close report
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function TextDialog({ open, onClose, title, label, field, url, submit, note, max = 2000, optional = false }: {
    open: boolean; onClose: () => void; title: string; label: string; field: string; url: string; submit: string;
    note?: string; max?: number; optional?: boolean;
}) {
    const form = useForm<Record<string, string>>({ [field]: '' });
    const errs = form.errors as Record<string, string | undefined>;
    const err = errs[field] ?? errs.status;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { form.reset(); form.clearErrors(); onClose(); } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {note && <DialogDescription>{note}</DialogDescription>}
                </DialogHeader>
                <form onSubmit={(e) => {
                    e.preventDefault();
                    form.post(url, { preserveScroll: true, onSuccess: () => { form.reset(); onClose(); } });
                }} className="space-y-3">
                    <label className="grid gap-1.5 text-sm">
                        {label}
                        <textarea value={form.data[field] ?? ''} onChange={(e) => form.setData(field, e.target.value)} rows={4} maxLength={max} className={textareaCls} autoFocus />
                    </label>
                    {err && <p className="text-xs text-red-600">{err}</p>}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={form.processing || (!optional && !(form.data[field] ?? '').trim())}>
                            {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {submit}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ConfirmDialog({ open, onClose, title, body, url, submit }: { open: boolean; onClose: () => void; title: string; body: string; url: string; submit: string }) {
    const [busy, setBusy] = useState(false);
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{body}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={busy} onClick={() => router.post(url, {}, {
                        preserveScroll: true, onStart: () => setBusy(true), onFinish: () => { setBusy(false); onClose(); },
                    })}>
                        {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {submit}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
