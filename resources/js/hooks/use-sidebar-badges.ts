import { router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import type { NavItem, SharedData } from '@/types';

const REFRESH_MS = 60_000;

/**
 * New / updated items since the last visit, per section (shared prop 'sidebarBadges', keys like "seller.orders").
 * Fresh on every page change; reloaded every 60 s while the tab is visible.
 */
export function useSidebarBadges(): Record<string, number> {
    const badges = usePage<SharedData>().props.sidebarBadges ?? {};

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            router.reload({ only: ['sidebarBadges'] });
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    return badges;
}

/** NavItem badge props for a count: red number (99+), or an amber "!" for -1. */
export function badgeProps(n?: number): Pick<NavItem, 'badge' | 'badgeTone'> {
    if (n === -1) return { badge: '!', badgeTone: 'warning' };
    if (n && n > 0) return { badge: n > 99 ? '99+' : String(n), badgeTone: 'alert' };
    return {};
}
