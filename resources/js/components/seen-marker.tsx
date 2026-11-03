import { router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * "New" / "Updated" row highlights — rows created or changed by someone else since the user's previous
 * visit to the section (SectionVisitService::flagsFor on the server, `seen` on each row).
 * Highlights stay until the user leaves the page, even across reloads after their own actions.
 */
export type SeenFlags = { is_new: boolean; is_updated: boolean; updated_at: string | null } | null | undefined;

type Memory = { path: string; flags: Record<string, NonNullable<SeenFlags>>; cleared: boolean };
let memory: Memory | null = null;

if (typeof window !== 'undefined') {
    // Leaving the page forgets its highlights
    router.on('navigate', (e) => {
        const path = new URL(e.detail.page.url, window.location.origin).pathname;
        if (memory && memory.path !== path) memory = null;
    });
}

function collect<T extends { id: number | string; seen?: SeenFlags }>(rows: T[]) {
    const out: Record<string, NonNullable<SeenFlags>> = {};
    for (const r of rows) if (r.seen) out[String(r.id)] = r.seen;
    return out;
}

export function useSeenRows<T extends { id: number | string; seen?: SeenFlags }>(rows: T[]) {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const [state, setState] = useState<Memory>(() => {
        const kept = memory && memory.path === path ? memory : null;
        return { path, flags: { ...collect(rows), ...(kept?.flags ?? {}) }, cleared: kept?.cleared ?? false };
    });

    // Later loads (paging, reload after an action) add flags but never drop the ones already shown
    useEffect(() => {
        setState((s) => ({ ...s, flags: { ...collect(rows), ...s.flags } }));
    }, [rows]);

    useEffect(() => { memory = state; }, [state]);

    const counts = useMemo(() => {
        const all = Object.values(state.flags);
        return { new: all.filter((f) => f.is_new).length, updated: all.filter((f) => f.is_updated).length };
    }, [state.flags]);

    return {
        /** Flags for a row (null when nothing to show or after "Mark all as seen") */
        get: (id: number | string): SeenFlags => (state.cleared ? null : state.flags[String(id)] ?? null),
        counts: state.cleared ? { new: 0, updated: 0 } : counts,
        clear: () => setState((s) => ({ ...s, cleared: true })),
    };
}

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
    const d = Math.round(h / 24);
    return `${d} day${d > 1 ? 's' : ''} ago`;
}

/** Dot + "New" / "Updated" pill, placed next to the row's number / name. */
export function SeenPill({ flags, className }: { flags: SeenFlags; className?: string }) {
    if (!flags) return null;
    const isNew = flags.is_new;
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none',
                isNew ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                className,
            )}
            title={isNew ? 'New since your last visit' : `Updated ${timeAgo(flags.updated_at)}`}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', isNew ? 'bg-blue-600' : 'bg-amber-500')} aria-hidden />
            {isNew ? 'New' : 'Updated'}
        </span>
    );
}

/** Row background for highlighted rows. */
export function seenRowClass(flags: SeenFlags): string {
    if (!flags) return '';
    return flags.is_new ? 'bg-blue-50/70 dark:bg-blue-950/25' : 'bg-amber-50/50 dark:bg-amber-950/15';
}

/** "3 new and 1 updated since your last visit · Mark all as seen" */
export function SeenNote({ counts, onClear, className }: { counts: { new: number; updated: number }; onClear: () => void; className?: string }) {
    if (counts.new + counts.updated === 0) return null;
    const parts = [
        counts.new > 0 && `${counts.new} new`,
        counts.updated > 0 && `${counts.updated} updated`,
    ].filter(Boolean).join(' and ');
    return (
        <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200', className)}>
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
            <span>{parts} since your last visit</span>
            <span className="text-blue-300" aria-hidden>·</span>
            <button type="button" onClick={onClear} className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                Mark all as seen
            </button>
        </div>
    );
}

/** Subtle glow for a summary card whose state needs the user's action (e.g. Pending orders). */
export function actionGlow(count: number | undefined | null): string {
    return count && count > 0
        ? 'ring-2 ring-amber-400/70 shadow-[0_0_14px_rgba(251,191,36,0.45)] dark:ring-amber-500/60'
        : '';
}
