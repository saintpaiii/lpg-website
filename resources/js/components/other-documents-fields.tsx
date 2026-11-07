import axios from 'axios';
import { AlertTriangle, FileText, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOCUMENT_ACCEPT, prepareDocumentFile } from '@/lib/resize-image';

/** One "Other documents (optional)" row on the seller application forms */
export type OtherDocRow = { key: number; label: string; file: File | null; expires_at: string };

export type PreviousOtherDoc = { id: number; label: string; status: string; expires_on: string | null; url: string };

export const OTHER_DOC_CHIPS = ['DTI Business Name', 'SEC Registration', 'Barangay Business Clearance', 'Store front photo', 'Other'];
export const OTHER_DOC_ACCEPT = DOCUMENT_ACCEPT;

let nextKey = 1;
export const newOtherRow = (): OtherDocRow => ({ key: nextKey++, label: '', file: null, expires_at: '' });

/** Rows the seller filled in, with their index in the request (empty rows are not sent) */
export function filledOtherRows(rows: OtherDocRow[]): OtherDocRow[] {
    return rows.filter((r) => r.label.trim() !== '' || r.file !== null);
}

/** Append filled rows as other_documents[i][label|file|expires_at] (guest form builds FormData by hand) */
export function appendOtherRows(fd: FormData, rows: OtherDocRow[]): void {
    filledOtherRows(rows).forEach((r, i) => {
        fd.append(`other_documents[${i}][label]`, r.label.trim());
        if (r.file) fd.append(`other_documents[${i}][file]`, r.file);
        fd.append(`other_documents[${i}][expires_at]`, r.expires_at);
    });
}

/** For useForm: the filled rows as an array the Inertia FormData conversion understands */
export function otherRowsPayload(rows: OtherDocRow[]) {
    return filledOtherRows(rows).map((r) => ({ label: r.label.trim(), file: r.file, expires_at: r.expires_at }));
}

const STATUS_STYLE: Record<string, string> = {
    pending:  'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
};

/**
 * "Other documents (optional)": label (quick-pick chips) + file + optional expiry date per row, ✕ to remove.
 * errors use the server keys (other_documents.{i}.label …); {i} is the index among FILLED rows.
 */
export function OtherDocumentsFields({ rows, onChange, errors = {}, max = 5, previous = [], minDate }: {
    rows: OtherDocRow[];
    onChange: (rows: OtherDocRow[]) => void;
    errors?: Record<string, string | undefined>;
    max?: number;
    previous?: PreviousOtherDoc[];
    /** Earliest allowed expiry date (tomorrow) */
    minDate?: string;
}) {
    const filled = filledOtherRows(rows);
    const indexOf = (r: OtherDocRow) => filled.indexOf(r);
    const err = (r: OtherDocRow, field: string) => {
        const i = indexOf(r);
        return i >= 0 ? errors[`other_documents.${i}.${field}`] : undefined;
    };
    const update = (key: number, patch: Partial<OtherDocRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    return (
        <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
            <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Other documents (optional)</p>
                <p className="text-xs text-gray-500">
                    Extra proof helps the review — e.g. DTI / SEC registration, barangay clearance, a photo of the store front.
                    JPG, PNG, WEBP or PDF · max 5 MB each · up to {max}.
                </p>
            </div>

            {previous.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Sent before</p>
                    {previous.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/60">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-200">{d.label}</span>
                            {d.expires_on && <span className="text-gray-500">valid until {d.expires_on}</span>}
                            <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_STYLE[d.status] ?? 'bg-gray-100 text-gray-600'}`}>{d.status}</span>
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">View</a>
                        </div>
                    ))}
                </div>
            )}

            {errors.other_documents && <p className="text-xs text-red-600">{errors.other_documents}</p>}

            {rows.map((r, n) => (
                <OtherDocRowFields
                    key={r.key} row={r} n={n + 1} minDate={minDate}
                    onChange={(patch) => update(r.key, patch)}
                    onRemove={() => onChange(rows.filter((x) => x.key !== r.key))}
                    errors={{ label: err(r, 'label'), file: err(r, 'file'), expires_at: err(r, 'expires_at') }}
                />
            ))}

            {rows.length < max ? (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...rows, newOtherRow()])}>
                    <Plus className="h-4 w-4" /> Add another document
                </Button>
            ) : (
                <p className="text-xs text-gray-500">You can add up to {max} extra documents here.</p>
            )}
        </div>
    );
}

function OtherDocRowFields({ row, n, onChange, onRemove, errors, minDate }: {
    row: OtherDocRow;
    n: number;
    onChange: (patch: Partial<OtherDocRow>) => void;
    onRemove: () => void;
    errors: { label?: string; file?: string; expires_at?: string };
    minDate?: string;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [typing, setTyping] = useState(false);   // "Other" chip → free text
    const [problem, setProblem] = useState<string | null>(null);

    return (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-500">Document {n}</p>
                <button type="button" onClick={onRemove} aria-label={`Remove document ${n}`} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {OTHER_DOC_CHIPS.map((c) => {
                    const active = c === 'Other' ? typing : row.label === c;
                    return (
                        <button
                            key={c} type="button"
                            onClick={() => {
                                if (c === 'Other') { setTyping(true); if (OTHER_DOC_CHIPS.includes(row.label)) onChange({ label: '' }); }
                                else { setTyping(false); onChange({ label: c }); }
                            }}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300'
                            }`}
                        >
                            {c}
                        </button>
                    );
                })}
            </div>

            <div className="grid gap-1">
                <Input
                    value={row.label} maxLength={100} placeholder="Name of the document, e.g. Barangay Clearance"
                    onChange={(e) => { setTyping(true); onChange({ label: e.target.value }); }}
                    className="h-9 text-sm" aria-label={`Name of document ${n}`}
                />
                {errors.label && <p className="text-xs text-red-600">{errors.label}</p>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1">
                    <input ref={fileRef} type="file" accept={OTHER_DOC_ACCEPT} className="hidden"
                        onChange={async (e) => {
                            const picked = e.target.files?.[0] ?? null;
                            e.target.value = '';
                            if (!picked) return;
                            // Any photo → real JPEG; PDFs unchanged
                            const { file: ready, problem: why } = await prepareDocumentFile(picked);
                            const tooBig = ready && ready.size > 5 * 1024 * 1024;
                            setProblem(why ?? (tooBig ? 'The file must be 5 MB or smaller.' : null));
                            if (ready && !tooBig) onChange({ file: ready });
                        }} />
                    {row.file ? (
                        <div className="flex min-w-0 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs dark:border-blue-800 dark:bg-blue-950/30">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                            <span className="min-w-0 flex-1 truncate">{row.file.name}</span>
                            <button type="button" onClick={() => onChange({ file: null })} aria-label="Remove file" className="text-gray-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    ) : (
                        <Button type="button" variant="outline" size="sm" className="h-9 justify-start" onClick={() => fileRef.current?.click()}>
                            Choose file…
                        </Button>
                    )}
                    {(problem || errors.file) && <p className="text-xs text-red-600">{problem ?? errors.file}</p>}
                </div>
                <div className="grid gap-1">
                    <Input type="date" value={row.expires_at} min={minDate} onChange={(e) => onChange({ expires_at: e.target.value })}
                        className="h-9 text-sm" aria-label={`Valid until (optional) for document ${n}`} />
                    <p className="text-[11px] text-gray-500">Valid until (optional)</p>
                    {errors.expires_at && <p className="text-xs text-red-600">{errors.expires_at}</p>}
                </div>
            </div>
        </div>
    );
}

// ── Store name check while typing ───────────────────────────────────────────

type NameCheck = { exists: boolean; count: number; cities: string[] };

/** Debounced GET /seller/register/check-name (600 ms). Returns null until something was found. */
export function useStoreNameCheck(name: string): NameCheck | null {
    const [result, setResult] = useState<NameCheck | null>(null);
    useEffect(() => {
        const q = name.trim();
        if (q.length < 3) { setResult(null); return; }
        const ctrl = new AbortController();
        const t = window.setTimeout(() => {
            axios.get<NameCheck>('/seller/register/check-name', { params: { name: q }, signal: ctrl.signal })
                .then((r) => setResult(r.data.exists ? r.data : null))
                .catch(() => { /* throttled / offline — just no hint */ });
        }, 600);
        return () => { window.clearTimeout(t); ctrl.abort(); };
    }, [name]);
    return result;
}

export function StoreNameWarning({ check }: { check: NameCheck | null }) {
    if (!check?.exists) return null;
    const where = check.cities.length ? ` in ${check.cities.join(', ')}` : '';
    return (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
                A store with this name already exists{where}. You can still use it — make sure your address and documents are your own.
            </span>
        </p>
    );
}
