import axios from 'axios';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ScanText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** One document's auto-read (OCR) result as the admin pages receive it — null = not read yet */
export type OcrResult = {
    read_at: string | null;
    unavailable: string | null;
    warnings: string[];
    text: string;
    likely_expiry: string | null;
    found_tin: string | null;
    name_match: boolean | null;
} | null;

export const AUTO_READ_DISCLAIMER = 'Auto-read can be wrong — always check the document yourself.';

/**
 * Reads the documents that have no result yet, ONE BY ONE (POST admin/stores/{store}/documents/{key}/ocr), so the
 * page never waits on all of them and the next visit is instant. Stops quietly when throttled or offline.
 * jobs: key → store id (renewals on the Store Documents page belong to different stores).
 * opts.urlFor: another endpoint (e.g. admin/verifications/{id}/ocr); opts.onResult: told about every new result.
 */
export function useAutoRead(
    jobs: Record<string, number>,
    initial: Record<string, OcrResult>,
    enabled: boolean,
    opts: { urlFor?: (key: string, id: number) => string; onResult?: (key: string, result: OcrResult) => void } = {},
) {
    const optsRef = useRef(opts);
    optsRef.current = opts;
    const [results, setResults] = useState<Record<string, OcrResult>>(initial);
    const [reading, setReading] = useState<string | null>(null);
    const started = useRef(false);
    const jobsRef = useRef(jobs);
    jobsRef.current = jobs;

    // New props after an Inertia reload → the server's saved results win; results read on this page are kept
    const initialKey = JSON.stringify(initial);
    useEffect(() => {
        setResults((r) => {
            const next: Record<string, OcrResult> = {};
            for (const k of Object.keys(initial)) next[k] = initial[k] ?? r[k] ?? null;
            return next;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialKey]);

    const readOne = useCallback(async (key: string): Promise<boolean> => {
        const storeId = jobsRef.current[key];
        if (!storeId) return false;
        setReading(key);
        try {
            const url = optsRef.current.urlFor?.(key, storeId) ?? `/admin/stores/${storeId}/documents/${key}/ocr`;
            const res = await axios.post<{ key: string; ocr: OcrResult }>(url);
            setResults((r) => ({ ...r, [key]: res.data.ocr }));
            optsRef.current.onResult?.(key, res.data.ocr);
            return true;
        } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 429) toast.warning('Auto-read paused — too many reads in a minute. Try "Read again" shortly.');
            return false;
        } finally {
            setReading(null);
        }
    }, []);

    useEffect(() => {
        if (!enabled || started.current) return;
        started.current = true;
        const todo = Object.keys(jobsRef.current).filter((k) => !initial[k]);
        (async () => {
            for (const key of todo) {
                if (!(await readOne(key))) break;
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return { results, reading, readAgain: readOne };
}

/** "Auto-read: ✅ Looks OK / ⚠ warnings · Show text · Read again" */
export function AutoReadLine({ result, reading, enabled, onReadAgain, canRead = true }: {
    result: OcrResult;
    reading: boolean;
    enabled: boolean;
    onReadAgain?: () => void;
    canRead?: boolean;
}) {
    const [open, setOpen] = useState(false);

    let body: React.ReactNode;
    if (reading) {
        body = <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading…</span>;
    } else if (!enabled) {
        body = <span className="text-muted-foreground">Auto-read not available</span>;
    } else if (!result) {
        body = <span className="text-muted-foreground">Waiting to be read…</span>;
    } else if (result.unavailable) {
        body = <span className="text-muted-foreground">{result.unavailable}</span>;
    } else if (result.warnings.length === 0) {
        body = <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Looks OK</span>;
    } else {
        body = (
            <span className="flex flex-col gap-0.5">
                {result.warnings.map((w, i) => (
                    <span key={i} className="inline-flex items-start gap-1 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span className="min-w-0 break-words">{w}</span>
                    </span>
                ))}
            </span>
        );
    }

    return (
        <div className="mt-1 rounded-md bg-gray-50 px-2 py-1.5 text-[11px] leading-snug dark:bg-gray-800/50">
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-500"><ScanText className="h-3 w-3" /> Auto-read:</span>
                <div className="min-w-0 flex-1">{body}</div>
                <span className="flex shrink-0 items-center gap-2">
                    {result && result.text && (
                        <button type="button" onClick={() => setOpen((o) => !o)} className="text-blue-600 hover:underline">{open ? 'Hide text' : 'Show text'}</button>
                    )}
                    {enabled && canRead && onReadAgain && !reading && (
                        <button type="button" onClick={onReadAgain} className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                            <RefreshCw className="h-3 w-3" /> Read again
                        </button>
                    )}
                </span>
            </div>
            {result && !result.unavailable && (result.likely_expiry || result.found_tin) && (
                <p className="mt-0.5 text-gray-500">
                    {result.likely_expiry && <>Date on document: {result.likely_expiry}</>}
                    {result.likely_expiry && result.found_tin && ' · '}
                    {result.found_tin && <>TIN: {result.found_tin}</>}
                </p>
            )}
            {open && result?.text && (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-[10px] text-gray-700 dark:bg-gray-900 dark:text-gray-300">{result.text}</pre>
            )}
        </div>
    );
}
