import { ScanFace } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Face++ result of an ID / driver's license vs the live selfie (FaceMatchService::present + has_selfie). */
export type FaceMatch = {
    status: 'passed' | 'failed' | 'no_face' | 'skipped' | 'error' | null;
    score: number | null;
    needed: number | null;
    message: string | null;
    auto: boolean;
    checked: string | null;
    has_selfie?: boolean;
};

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);

/** Plain-English line, e.g. "Face match failed — 41% (needed 69%)". */
export function faceMatchText(f: FaceMatch | null | undefined): string {
    if (!f || !f.status) {
        return f?.has_selfie === false ? 'No selfie — uploaded before face check' : 'Not checked — sent before the face check';
    }
    switch (f.status) {
        case 'passed':  return `Face match ${pct(f.score)} (needed ${pct(f.needed)})`;
        case 'failed':  return `Face match failed — ${pct(f.score)} (needed ${pct(f.needed)})`;
        case 'no_face': return f.message || 'No face found';
        case 'skipped': return f.message && /PDF/.test(f.message) ? f.message : 'Face check unavailable';
        default:        return `Face check unavailable${f.message?.match(/\(([^)]+)\)/) ? ` (${f.message.match(/\(([^)]+)\)/)![1]})` : ''}`;
    }
}

const TONE: Record<string, string> = {
    passed:  'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    failed:  'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    no_face: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

export default function FaceMatchChip({ face, className }: { face: FaceMatch | null | undefined; className?: string }) {
    return (
        <span
            className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                TONE[face?.status ?? ''] ?? 'bg-muted text-muted-foreground', className)}
            title={face?.checked ? `Checked ${face.checked}` : undefined}
        >
            <ScanFace className="h-3 w-3 shrink-0" /> {faceMatchText(face)}
        </span>
    );
}

/** "Auto-approved · face match 92%" */
export function AutoApprovedBadge({ face, className }: { face: FaceMatch | null | undefined; className?: string }) {
    return (
        <span className={cn('inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', className)}>
            Auto-approved · face match {pct(face?.score ?? null)}
        </span>
    );
}
