import { router, usePage } from '@inertiajs/react';
import { CheckCircle2, Circle, CircleHelp, PartyPopper, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { markDone, markSkipped, useTutorialProgress } from '@/tutorials/store';
import { startTour, useAutoTour, useCurrentTour } from '@/tutorials/use-tour';
import type { SharedData } from '@/types';

/** Starts first-time tours by themselves (mounted once per layout; renders nothing). */
export function TutorialRunner({ layout }: { layout: 'app' | 'customer' }) {
    useAutoTour(layout);
    return null;
}

/** "?" in the page header — replays this page's tour. Shown only when the page has one. */
export function TutorialHelpButton() {
    const { tour, ctx } = useCurrentTour();
    if (!tour) return null;
    return (
        <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Show tutorial for this page"
            title="Show tutorial for this page"
            onClick={() => startTour(tour, ctx, { replay: true })}
        >
            <CircleHelp className="size-4" />
        </Button>
    );
}

export type GettingStartedItem = { key: string; label: string; done: boolean; optional: boolean; url: string; tour: string | null };
export type GettingStarted = { key: string; role: string; intro: string | null; items: GettingStartedItem[]; complete: boolean } | null;

/**
 * "Getting started" card on the role's home page (server-computed, ✓ from real data). "Show me" opens the page and starts
 * its tour. Hide → saved as skipped. When every required item is ✓ it says "You're all set!" once and then disappears.
 */
export function GettingStartedCard({ className = '' }: { className?: string }) {
    const gs = (usePage<SharedData>().props.getting_started ?? null) as GettingStarted;
    const progress = useTutorialProgress();
    const [hidden, setHidden] = useState(false);
    const key = gs?.key;
    const seen = key ? !!(progress.progress[key]?.done || progress.progress[key]?.skipped) : false;

    // "You're all set!" is shown once — remember it so the card is gone next time
    useEffect(() => {
        if (gs?.complete && key && !seen) markDone(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gs?.complete, key]);

    if (!gs || hidden || !progress.enabled || (seen && !gs.complete)) return null;
    const required = gs.items.filter((i) => !i.optional);
    const doneCount = required.filter((i) => i.done).length;

    if (gs.complete) {
        return (
            <div className={`flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 ${className}`}>
                <PartyPopper className="h-5 w-5 shrink-0" />
                <p className="flex-1 font-medium">You’re all set! Everything on your getting-started list is done.</p>
                <button type="button" aria-label="Close" onClick={() => setHidden(true)} className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"><X className="h-4 w-4" /></button>
            </div>
        );
    }

    return (
        <div className={`rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/20 ${className}`}>
            <div className="flex flex-wrap items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">Getting started <span className="font-normal text-muted-foreground">· {doneCount} of {required.length} done</span></p>
                    {gs.intro && <p className="text-xs text-muted-foreground">{gs.intro}</p>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { if (key) markSkipped(key); setHidden(true); }}>Hide</Button>
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {gs.items.map((i) => (
                    <li key={i.key} className="flex items-center gap-2 rounded-md bg-white/70 px-2.5 py-1.5 dark:bg-gray-900/40">
                        {i.done
                            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />
                            : <Circle className="h-4 w-4 shrink-0 text-gray-400" aria-label="Not done yet" />}
                        <span className={`min-w-0 flex-1 ${i.done ? 'text-muted-foreground line-through decoration-1' : 'text-gray-800 dark:text-gray-200'}`}>{i.label}</span>
                        {!i.done && (
                            <button
                                type="button"
                                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                                onClick={() => router.visit(i.tour ? `${i.url}?tour=${encodeURIComponent(i.tour)}` : i.url)}
                            >
                                Show me
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
