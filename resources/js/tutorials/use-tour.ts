import { router, usePage } from '@inertiajs/react';
import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useEffect } from 'react';
import type { SharedData } from '@/types';
import { useTourContext } from './context';
import { coreTourFor, isAvailable, pageTourFor, tourByKey } from './registry';
import { getProgress, isSeen, markDone, markSkipped, syncFromServer } from './store';
import type { Tour, TourCtx } from './types';

// MODULE level: layouts remount on every page, the running tour must not be forgotten
let running: Driver | null = null;
let runningKey: string | null = null;
let runningReplay = false;
let navListenerAdded = false;

export const isTourRunning = () => running !== null && running.isActive();

/** First VISIBLE match (phones duplicate some links in the bottom bar; the closed sidebar sheet isn't in the page) */
function visibleElement(selector: string): Element | undefined {
    let list: NodeListOf<Element>;
    try { list = document.querySelectorAll(selector); } catch { return undefined; }
    for (const el of Array.from(list)) {
        const r = el.getBoundingClientRect();
        const st = window.getComputedStyle(el);
        if (r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && el.getClientRects().length > 0) {
            return el;
        }
    }
    return undefined;
}

function buildSteps(tour: Tour, ctx: TourCtx): DriveStep[] {
    const steps: DriveStep[] = [];
    for (const s of tour.steps) {
        if (s.when && !s.when(ctx)) continue;
        // A menu item this user doesn't have → leave the step out (customers keep it: their items are only locked)
        if (s.nav && ctx.group !== 'customer' && !ctx.navHrefs.has(s.nav)) continue;
        const selector = s.element ?? (s.nav ? `[data-tour="nav:${s.nav}"]` : undefined);
        const el = selector ? visibleElement(selector) : undefined;
        const text = ctx.group === 'customer' && !ctx.verified && s.lockedText ? s.lockedText : s.text;
        steps.push({
            element: el,   // missing / hidden → centred popover instead of breaking
            popover: { title: s.title, description: text, side: el ? s.side : undefined, align: 'start' },
        });
    }
    return steps;
}

/** No tour while a dialog is open (legal update, plan popup, upgrade, any page dialog) or the install-app banner shows */
export function dialogOpen(): boolean {
    if (document.querySelector('[role="dialog"][data-state="open"]:not(.driver-popover), [role="alertdialog"]:not(.driver-popover)')) return true;
    // The install-app banner counts only while it is actually on screen (it stays in the page, hidden, on desktop)
    return Array.from(document.querySelectorAll('[data-tour-blocker]')).some((el) => el.getClientRects().length > 0);
}

export function startTour(tour: Tour, ctx: TourCtx, opts: { replay?: boolean } = {}): boolean {
    if (isTourRunning()) return false;
    const steps = buildSteps(tour, ctx);
    if (steps.length === 0) return false;

    const key = tour.key;
    runningKey = key;
    runningReplay = !!opts.replay;
    let finished = false;

    const d = driver({
        steps,
        showProgress: steps.length > 1,
        progressText: '{{current}} of {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        allowClose: true,
        overlayClickBehavior: 'close',
        smoothScroll: true,
        stagePadding: 6,
        popoverClass: 'lpg-tour',
        onPopoverRender: (popover, { driver: drv }) => {
            // "Skip tour" in every popover
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'lpg-tour-skip';
            skip.textContent = 'Skip tour';
            skip.addEventListener('click', () => drv.destroy());
            popover.footer.insertBefore(skip, popover.footer.firstChild);
        },
        onNextClick: (_el, _step, { driver: drv }) => {
            if (!drv.hasNextStep()) { finished = true; drv.destroy(); return; }
            drv.moveNext();
        },
        onDestroyed: () => {
            if (finished) markDone(key);
            else if (!runningReplay) markSkipped(key);   // replays never change "done" to "skipped"
            running = null;
            runningKey = null;
            runningReplay = false;
        },
    });
    running = d;
    d.drive();
    return true;
}

/** Leaving the page closes a running tour */
function ensureNavListener() {
    if (navListenerAdded || typeof window === 'undefined') return;
    navListenerAdded = true;
    router.on('start', () => { if (running?.isActive()) running.destroy(); });
}

const NEVER_COMPONENTS = /^(auth\/|errors\/|invoice-print|landing|welcome$|legal\/)/;

/**
 * Starts tours by themselves: the role's CORE tour on its home page (first), then the page tour the first time each
 * page is opened. Mounted once in the app layout and once in the customer layout.
 */
export function useAutoTour(layout: 'app' | 'customer'): void {
    const page = usePage<SharedData>();
    const ctx = useTourContext();
    const user = page.props.auth.user;

    // Keep the local copy of the saved progress up to date (merge only)
    useEffect(() => {
        syncFromServer(user.tutorials, user.tutorials_enabled);
        ensureNavListener();
    }, [user.tutorials, user.tutorials_enabled]);

    useEffect(() => {
        if (typeof window === 'undefined' || window.navigator.webdriver) return;
        const component = page.component;
        if (NEVER_COMPONENTS.test(component)) return;

        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const asked = params.get('tour');
        let tries = 0;
        let timer: number | undefined;

        const attempt = () => {
            if (isTourRunning()) return;
            if (dialogOpen()) {
                // Retry while a dialog (legal update, plan popup, install banner…) is open — up to ~5 minutes
                if (tries++ < 150) timer = window.setTimeout(attempt, 2000);
                return;
            }

            // "Show me" / Help → Start: ?tour=<key>
            if (asked) {
                const t = tourByKey(asked);
                const url = new URL(window.location.href);
                url.searchParams.delete('tour');
                router.replace({ url: url.pathname + url.search + url.hash, preserveScroll: true, preserveState: true });
                if (t && isAvailable(t, ctx)) startTour(t, ctx, { replay: isSeen(t.key) });
                return;
            }

            if (!getProgress().enabled) return;
            // Customer tours only for customers (sellers / admins also open the customer portal to shop or preview)
            if (layout === 'customer' && ctx.group !== 'customer') return;

            const core = coreTourFor(ctx);
            if (core && !isSeen(core.key)) {
                if (ctx.homePaths.includes(path)) startTour(core, ctx);
                return;   // page tours wait until the core tour was seen
            }
            const t = pageTourFor(component, path, ctx);
            if (t && !isSeen(t.key)) startTour(t, ctx);
        };

        // Wait for the page to render
        timer = window.setTimeout(attempt, 700);
        return () => { if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page.component, page.url]);
}

/** The "?" button: the current page's tour (or the core tour on a home page without one) */
export function useCurrentTour(): { tour: Tour | null; ctx: TourCtx } {
    const page = usePage<SharedData>();
    const ctx = useTourContext();
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isCustomerPortalPreview = page.component.startsWith('customer/') && ctx.group !== 'customer';
    if (isCustomerPortalPreview) return { tour: null, ctx };
    const t = pageTourFor(page.component, path, ctx)
        ?? (ctx.homePaths.includes(path) ? coreTourFor(ctx) : null);
    return { tour: t, ctx };
}

