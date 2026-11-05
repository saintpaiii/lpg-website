import { Link, usePage } from '@inertiajs/react';
import { EyeOff } from 'lucide-react';
import type { SharedData } from '@/types';

type Reason = { code: string; text: string; rider_id: number | null };
export type StoreVisibility = { visible: boolean; reasons: Reason[]; staff_full: boolean } | null;

/** Plan and document reasons have their own banners (PlanStatusBanner, DocumentSuspensionBanner). */
const OTHER_BANNERS = ['plan', 'documents'];

/**
 * "Your products are hidden from customers — No rider yet." A store needs at least one rider who can deliver
 * (active, not paused, approved valid driver's license) to be shown. Owner gets the fix button; staff get the text.
 */
export function StoreVisibilityBanner() {
    const { auth, storeVisibility } = usePage<SharedData & { storeVisibility?: StoreVisibility }>().props;
    if (!storeVisibility || storeVisibility.visible) return null;
    const reason = storeVisibility.reasons.find((r) => !OTHER_BANNERS.includes(r.code));
    if (!reason) return null;

    const isOwner = auth.user?.role === 'seller';
    const full = reason.code === 'no_rider' && storeVisibility.staff_full;
    const action = !isOwner ? null
        : full ? { href: '/seller/plan', label: 'My Plan' }
        : reason.code === 'no_rider' ? { href: '/seller/staff?add=rider', label: 'Add a rider' }
        : reason.code === 'license_pending' && reason.rider_id ? { href: `/seller/staff/${reason.rider_id}`, label: 'Review license' }
        : reason.rider_id ? { href: `/seller/staff/${reason.rider_id}`, label: 'Open rider' }
        : { href: '/seller/staff', label: 'Open Staff' };

    return (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 sm:mx-6">
            <EyeOff className="h-4 w-4 shrink-0" />
            <p className="flex-1 min-w-0">
                <strong>Your products are hidden from customers</strong> — {reason.text}.
                {full && ' Your staff limit is full — deactivate someone or upgrade your plan.'}
                {!isOwner && ' Ask your store owner to add or approve a rider.'}
            </p>
            {action && (
                <Link href={action.href} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                    {action.label}
                </Link>
            )}
        </div>
    );
}
