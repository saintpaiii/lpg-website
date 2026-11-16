import { Head, Link } from '@inertiajs/react';
import { SeenNote, SeenPill, seenRowClass, useSeenRows } from '@/components/seen-marker';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAdminAccess } from '@/hooks/use-store-access';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { AUTO_READ_DISCLAIMER, AutoReadLine, useAutoRead, type OcrResult } from '@/components/document-auto-read';
import DocumentReviewViewer, { type ReviewItem } from '@/components/document-review-viewer';

type Pending = {
    id: number; store_id: number; store_name: string | null; doc_type: string; label: string; is_other: boolean; has_expiry: boolean;
    current_expires: string | null; new_expires: string | null; new_expires_on: string | null; submitted_on: string; submitted_by: string | null; url: string;
    ocr_key?: string; ocr?: OcrResult; is_pdf?: boolean; max_date?: string;
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
    ocr_enabled?: boolean;
    reject_reasons?: string[];
};

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Store Documents', href: '/admin/store-documents' }];
const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Waiting for review' },
    { key: 'expiring', label: 'Expiring soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'missing', label: 'Missing dates' },
];

export default function AdminStoreDocuments({ tab: initialTab, pending, expiring, expired, missing, counts, max_date, ocr_enabled = false, reject_reasons = [] }: Props) {
    // Platform staff with Verifications but not Stores: store names stay plain text (store page = 403)
    const canStores = useAdminAccess().canOpen('/admin/stores');
    // New / updated since the last visit (until the user leaves the page)
    const seen = useSeenRows(pending);
    const [tab, setTab] = useState<Tab>(initialTab);
    // Auto-read the documents waiting for review, one by one (warnings only)
    const ocrJobs: Record<string, number> = {};
    const ocrInitial: Record<string, OcrResult> = {};
    for (const p of pending) if (p.ocr_key) { ocrJobs[p.ocr_key] = p.store_id; ocrInitial[p.ocr_key] = p.ocr ?? null; }
    const autoRead = useAutoRead(ocrJobs, ocrInitial, ocr_enabled);
    // Same viewer as the store application review: Accept (with the "valid until" read by OCR) / Reject with a reason
    const [openKey, setOpenKey] = useState<string | null>(null);
    const items: ReviewItem[] = pending.map((p) => ({
        key: String(p.id), label: `${p.label} — ${p.store_name ?? 'store'}`, url: p.url, is_pdf: !!p.is_pdf, needs_date: p.has_expiry,
        status: null, ocr_key: p.ocr_key ?? null, saved_date: null, max_date: p.max_date,
        extra: p.has_expiry && !p.is_other ? <p className="text-xs text-muted-foreground">Current valid until: {p.current_expires ?? 'no date'}</p> : undefined,
    }));

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
                            <p className="text-[11px] italic text-muted-foreground">{AUTO_READ_DISCLAIMER}</p>
                            <SeenNote counts={seen.counts} onClear={seen.clear} />
                            {pending.map((p) => (
                                <li key={p.id} className={`flex flex-col gap-3 rounded-lg border bg-white px-4 py-3 sm:flex-row sm:items-center dark:bg-gray-950 ${seenRowClass(seen.get(p.id))}`}>
                                    <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                                        <p className="font-semibold"><SeenPill flags={seen.get(p.id)} className="mr-1.5" />{p.label}{p.is_other && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(extra document)</span>}</p>
                                        <p>
                                            {canStores ? <Link href={`/admin/stores/${p.store_id}`} className="text-blue-600 hover:underline">{p.store_name}</Link> : <span className="font-medium">{p.store_name}</span>}
                                            <span className="text-muted-foreground"> · submitted {p.submitted_on}{p.submitted_by ? ` by ${p.submitted_by}` : ''}</span>
                                        </p>
                                        {p.has_expiry && (
                                            <p className="text-muted-foreground">
                                                Current valid until: {p.current_expires ?? 'no date'} — the new date is read from the document when you review it.
                                            </p>
                                        )}
                                        {p.ocr_key && (
                                            <AutoReadLine
                                                result={autoRead.results[p.ocr_key] ?? null} reading={autoRead.reading === p.ocr_key}
                                                enabled={ocr_enabled} onReadAgain={() => autoRead.readAgain(p.ocr_key!)}
                                            />
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button size="sm" className="gap-1.5" onClick={() => setOpenKey(String(p.id))}><Eye className="h-3.5 w-3.5" /> Review</Button>
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
                                            {canStores ? <Link href={`/admin/stores/${r.store_id}`} className="font-medium text-blue-600 hover:underline">{r.store_name}</Link> : <span className="font-medium">{r.store_name}</span>}
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

            <DocumentReviewViewer
                items={items} openKey={openKey} onOpenKey={setOpenKey} reasons={reject_reasons} maxDate={max_date} title="Renewed / extra document"
                ocr={{ results: autoRead.results, reading: autoRead.reading, readAgain: autoRead.readAgain, enabled: ocr_enabled }}
                actions={{
                    accept: (i, date) => ({ url: `/admin/store-documents/${i.key}/approve`, data: (i.needs_date ? { expires_at: date } : {}) as Record<string, string> }),
                    reject: (i, reason, note) => ({ url: `/admin/store-documents/${i.key}/reject`, data: { reason: note ? `${reason} (${note})` : reason } }),
                }}
            />
        </AppLayout>
    );
}
