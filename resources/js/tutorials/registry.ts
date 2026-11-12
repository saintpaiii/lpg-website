import { adminTours, sharedTours } from './admin';
import { customerTours } from './customer';
import { sellerTours } from './seller';
import { riderTours, staffTours } from './staff-rider';
import type { Tour, TourCtx } from './types';

export const ALL_TOURS: Tour[] = [...customerTours, ...sellerTours, ...staffTours, ...riderTours, ...adminTours, ...sharedTours];

const STORE_GROUPS = new Set(['seller', 'staff', 'rider']);

/** May this user open the tour's page? (role group, menu item present and not plan-locked, extra rules) */
export function isAvailable(tour: Tour, ctx: TourCtx): boolean {
    if (tour.access && !tour.access(ctx)) return false;
    if (tour.core) return tour.group === ctx.group;
    if (tour.group === 'shared') return true;
    if (tour.group === 'customer') return ctx.group === 'customer';
    if (tour.nav) return ctx.navHrefs.has(tour.nav);
    if (tour.group === 'admin') return ctx.group === 'admin';
    return STORE_GROUPS.has(ctx.group);
}

export function coreTourFor(ctx: TourCtx): Tour | null {
    return ALL_TOURS.find((t) => t.core && t.group === ctx.group && isAvailable(t, ctx)) ?? null;
}

/** The page tour for this Inertia component + URL (components shared by /seller and /rider are told apart by urlPrefix) */
export function pageTourFor(component: string, path: string, ctx: TourCtx): Tour | null {
    const matches = ALL_TOURS.filter((t) => !t.core && t.page?.includes(component) && (!t.urlPrefix || path.startsWith(t.urlPrefix)));
    // The most specific urlPrefix wins
    matches.sort((a, b) => (b.urlPrefix?.length ?? 0) - (a.urlPrefix?.length ?? 0));
    return matches.find((t) => isAvailable(t, ctx)) ?? null;
}

export function tourByKey(key: string): Tour | null {
    return ALL_TOURS.find((t) => t.key === key) ?? null;
}

/** Help page: the core tour first, then this user's page tours */
export function toursForHelp(ctx: TourCtx): Tour[] {
    const core = coreTourFor(ctx);
    const pages = ALL_TOURS.filter((t) => !t.core && isAvailable(t, ctx));
    // One row per key (a tour can be listed once even if it covers several pages)
    return [...(core ? [core] : []), ...pages];
}

/** Where Help → Start opens the tour (null = it needs a record, see tour.where) */
export function startUrlFor(tour: Tour, ctx: TourCtx): string | null {
    if (tour.core) return tour.url ?? ctx.homePaths[0] ?? null;
    return tour.url ?? null;
}
