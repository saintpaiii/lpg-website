import { Link, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';
import type { ReportCategory, ReporterSide, ReportOrder } from './types';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

const GROUPS: Record<ReporterSide, { route: ReportCategory['route']; title: string }[]> = {
    customer: [
        { route: 'store', title: 'The store will handle it · The admin also monitors it' },
        { route: 'both', title: 'Sent to the store and the admin' },
        { route: 'admin', title: 'Sent to the admin only' },
    ],
    store: [{ route: 'admin', title: 'Sent to the platform admin' }],
    rider: [{ route: 'both', title: 'Sent to the store and the platform admin' }],
};

const DETAIL_LINK: Record<ReporterSide, (id: string) => string> = {
    customer: (id) => `/customer/reports/${id}`,
    store: (id) => `/seller/customer-reports/${id}`,
    rider: (id) => `/rider/reports/${id}`,
};

type FormData = { order_id: number; category: string; product_id: string; subject: string; description: string; evidence: File[] };

/** "Report a problem" form — categories come from config/reports.php via the reportCategories prop. */
export default function ReportFormDialog({ open, onOpenChange, reporterSide, order, submitUrl, title }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reporterSide: ReporterSide;
    order: ReportOrder;
    submitUrl: string;
    title?: string;
}) {
    const all = (usePage<SharedData>().props.reportCategories ?? {}) as Record<string, ReportCategory>;
    const categories = useMemo(() => Object.entries(all).filter(([key, c]) =>
        c.reporter === reporterSide && !(key === 'rider_behavior' && !order.has_rider)), [all, reporterSide, order.has_rider]);

    const form = useForm<FormData>({ order_id: order.id, category: '', product_id: '', subject: '', description: '', evidence: [] });
    const [previews, setPreviews] = useState<string[]>([]);
    const [fileError, setFileError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const chosen = form.data.category ? all[form.data.category] : null;
    const errors = form.errors as Record<string, string | undefined>;

    useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

    function reset() {
        form.reset();
        form.clearErrors();
        setPreviews([]);
        setFileError(null);
    }

    function addFiles(list: FileList | null) {
        setFileError(null);
        if (!list) return;
        const incoming = Array.from(list);
        const room = MAX_FILES - form.data.evidence.length;
        if (incoming.length > room) setFileError(`You can attach up to ${MAX_FILES} files.`);
        const ok = incoming.slice(0, room).filter((f) => {
            if (f.size > MAX_BYTES) { setFileError(`${f.name} is larger than 10 MB.`); return false; }
            return true;
        });
        form.setData('evidence', [...form.data.evidence, ...ok]);
        setPreviews((p) => [...p, ...ok.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : ''))]);
        if (fileRef.current) fileRef.current.value = '';
    }

    function removeFile(i: number) {
        if (previews[i]) URL.revokeObjectURL(previews[i]);
        form.setData('evidence', form.data.evidence.filter((_, j) => j !== i));
        setPreviews((p) => p.filter((_, j) => j !== i));
    }

    function submit(e: FormEvent) {
        e.preventDefault();
        form.transform((d) => ({ ...d, product_id: d.product_id || null }) as unknown as FormData);
        form.post(submitUrl, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => { reset(); onOpenChange(false); },
        });
    }

    const sentTo = chosen && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-500">This report will be sent to:</span>
            {chosen.route !== 'admin' && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                    {order.store_name}{chosen.route === 'store' && reporterSide === 'customer' ? ' (the platform admin can also see it)' : ''}
                </span>
            )}
            {chosen.route !== 'store' && <span className="rounded-full bg-gray-800 px-2 py-0.5 font-medium text-white">Platform admin</span>}
            {reporterSide === 'customer' && chosen.route === 'admin' && <span className="w-full text-gray-500">The store will not see this report.</span>}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title ?? (reporterSide === 'customer' ? 'Report a problem' : 'Report customer')}</DialogTitle>
                    <DialogDescription>Order {order.order_number}</DialogDescription>
                </DialogHeader>

                <form onSubmit={submit} className="space-y-4">
                    {/* Category */}
                    <div className="space-y-3" role="radiogroup" aria-label="What happened?">
                        <Label>What happened?</Label>
                        {GROUPS[reporterSide].map((g) => {
                            const items = categories.filter(([, c]) => c.route === g.route);
                            if (!items.length) return null;
                            return (
                                <div key={g.route} className="space-y-1.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.title}</p>
                                    {items.map(([key, c]) => {
                                        const active = form.data.category === key;
                                        return (
                                            <button key={key} type="button" role="radio" aria-checked={active}
                                                onClick={() => form.setData('category', key)}
                                                className={cn('w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                                    active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                                                    c.urgent && 'border-red-300')}>
                                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                                    {c.urgent && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}{c.label}
                                                </span>
                                                <span className="block text-xs text-gray-500">{c.hint}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {errors.category && (
                            <p className="text-xs text-red-600">
                                {errors.category}
                                {errors.existing_report_id && (
                                    <> <Link href={DETAIL_LINK[reporterSide](errors.existing_report_id)} className="font-semibold underline">View report</Link></>
                                )}
                            </p>
                        )}
                    </div>

                    {chosen && (
                        <>
                            {form.data.category === 'gas_leak' && (
                                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                                    <p className="mb-1 flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4" /> Safety first</p>
                                    If gas is leaking now: close the tank valve, open doors and windows, do not turn on lights or use your phone near the tank,
                                    move everyone outside, and call 911 or the fire department (BFP).
                                </div>
                            )}

                            {sentTo}

                            {chosen.target === 'product' && order.items.length > 0 && (
                                <div className="grid gap-1.5">
                                    <Label htmlFor="report-product">Which item? (optional)</Label>
                                    <select id="report-product" value={form.data.product_id} onChange={(e) => form.setData('product_id', e.target.value)}
                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">Not sure / the whole order</option>
                                        {order.items.map((i) => <option key={i.product_id} value={i.product_id}>{i.name}</option>)}
                                    </select>
                                    {errors.product_id && <p className="text-xs text-red-600">{errors.product_id}</p>}
                                </div>
                            )}

                            <div className="grid gap-1.5">
                                <Label htmlFor="report-subject">Short title</Label>
                                <Input id="report-subject" value={form.data.subject} maxLength={150} onChange={(e) => form.setData('subject', e.target.value)} placeholder="e.g. Got a 2.7kg tank instead of 11kg" />
                                {errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="report-description">What happened?</Label>
                                <textarea id="report-description" value={form.data.description} maxLength={5000} rows={4}
                                    onChange={(e) => form.setData('description', e.target.value)}
                                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="Tell us what happened, when, and what you'd like done." />
                                <p className={cn('text-right text-[11px]', form.data.description.trim().length < 10 ? 'text-gray-400' : 'text-gray-500')}>
                                    {form.data.description.length}/5000{form.data.description.trim().length < 10 && ' · at least 10 characters'}
                                </p>
                                {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
                            </div>

                            <div className="grid gap-1.5">
                                <Label>Photos or files (optional, up to {MAX_FILES})</Label>
                                <div className="flex flex-wrap gap-2">
                                    {form.data.evidence.map((f, i) => (
                                        <div key={i} className="relative">
                                            {previews[i]
                                                ? <img src={previews[i]} alt={f.name} className="h-16 w-16 rounded-md border object-cover" />
                                                : <span className="flex h-16 w-16 flex-col items-center justify-center rounded-md border text-[10px] text-gray-500"><FileText className="h-5 w-5" />{f.name.split('.').pop()?.toUpperCase()}</span>}
                                            <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}
                                                className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-800 p-0.5 text-white"><X className="h-3 w-3" /></button>
                                        </div>
                                    ))}
                                    {form.data.evidence.length < MAX_FILES && (
                                        <button type="button" onClick={() => fileRef.current?.click()}
                                            className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500 hover:bg-gray-50">
                                            <Paperclip className="h-4 w-4" /> Add
                                        </button>
                                    )}
                                </div>
                                <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,application/pdf" className="hidden" onChange={(e) => addFiles(e.target.files)} />
                                {(fileError || Object.entries(errors).find(([k]) => k.startsWith('evidence'))?.[1]) && (
                                    <p className="text-xs text-red-600">{fileError ?? Object.entries(errors).find(([k]) => k.startsWith('evidence'))?.[1]}</p>
                                )}
                            </div>
                        </>
                    )}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={form.processing || !chosen || !form.data.subject.trim() || form.data.description.trim().length < 10}>
                            {form.processing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send report
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
