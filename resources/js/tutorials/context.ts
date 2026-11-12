import { usePage } from '@inertiajs/react';
import { useMemo } from 'react';
import { usePermission } from '@/hooks/use-permission';
import { usePlan } from '@/hooks/use-plan';
import { buildAppNav, hrefOf } from '@/lib/app-nav';
import type { SharedData } from '@/types';
import type { TourCtx, TourGroup } from './types';

const pathOf = (u: string | null | undefined, fallback: string) => {
    if (!u) return fallback;
    try { return new URL(u, window.location.origin).pathname; } catch { return fallback; }
};

/** Who is looking: role group, home page and the pages their menu lets them open (same rules as the sidebar). */
export function useTourContext(): TourCtx {
    const { props, url } = usePage<SharedData>();
    const { can } = usePermission();
    const { has } = usePlan();
    const auth = props.auth;
    const user = auth.user;
    const role = user.role as string;
    const subRole = (user.sub_role as string | null | undefined) ?? null;
    const permKey = (auth.permissions ?? []).join(',');
    const planKey = (props.plan?.features ?? []).join(',');

    return useMemo<TourCtx>(() => {
        const riderUser = role === 'rider' || (role === 'seller_staff' && subRole === 'rider');
        const isPlatformStaff = role === 'platform_staff' || !!user.is_platform_staff;
        const group: TourGroup = role === 'customer' ? 'customer'
            : role === 'seller' ? 'seller'
            : riderUser ? 'rider'
            : role === 'seller_staff' ? 'staff'
            : 'admin';

        const navHrefs = new Set<string>();
        if (group !== 'customer') {
            const base = { role, subRole, isPlatformStaffFlag: !!user.is_platform_staff, canSwitchPortal: auth.can_switch_portal, selfClock: auth.self_clock, can, has };
            // A rider with store roles can open both menus
            const urls = auth.can_switch_portal ? ['/rider/deliveries', '/seller/x'] : [url];
            for (const u of urls) {
                for (const item of buildAppNav({ ...base, url: u }).items) {
                    if (!item.lockedPlan && !item.disabled) { const h = hrefOf(item.href); if (h) navHrefs.add(h); }
                }
            }
        }

        const verified = user.id_verification_status === 'verified';
        const homePaths = group === 'customer' ? [verified ? '/customer/products' : '/customer/id-verification']
            : group === 'rider' ? ['/rider/deliveries']
            : group === 'seller' ? ['/seller/dashboard']
            : group === 'staff' ? [pathOf(auth.store_portal_url, '/seller/my-attendance')]
            : [pathOf(auth.home_url, '/admin/dashboard')];

        return {
            group, role, verified,
            hasHistory: auth.has_customer_history !== false,
            isOwner: role === 'seller',
            isHybrid: riderUser && !!auth.can_switch_portal,
            isPlatformStaff,
            navHrefs,
            homePaths,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, subRole, permKey, planKey, auth.can_switch_portal, auth.self_clock, auth.store_portal_url, auth.home_url,
        user.id_verification_status, user.is_platform_staff, auth.has_customer_history, url.startsWith('/seller')]);
}
