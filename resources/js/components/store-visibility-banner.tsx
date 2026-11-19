import { Link, usePage } from '@inertiajs/react';
import { Store } from 'lucide-react';
import type { SharedData } from '@/types';

type Reason = { code: string; text: string; rider_id: number | null };
export type StoreVisibility = {
    visible: boolean;
    /** Hidden reasons: plan / documents (their own banners: PlanStatusBanner, DocumentSuspensionBanner) */
    reasons: Reason[];
    can_deliver?: boolean;
    /** J4: visible, but no rider / vehicle → customers can only pick up */
    pickup_only?: boolean;
    delivery_reasons?: Reason[];
    staff_full: boolean;
} | null;

/** Vehicle reasons (Store::vehicleReason) — fixed on the Vehicles page */
const VEHICLE_ACTIONS: Record<string, string> = {
    no_vehicle:           'Add a vehicle',
    vehicles_unavailable: 'Open Vehicles',
    no_delivery_fee:      'Set delivery fees',
};

/** The owner's fix link for one delivery reason (staff get no button). */
function fixFor(reason: Reason, staffFull: boolean): { href: string; label: string } {
    if (reason.code in VEHICLE_ACTIONS) return { href: '/seller/vehicles', label: VEHICLE_ACTIONS[reason.code] };
    if (reason.code === 'no_rider') return staffFull ? { href: '/seller/plan', label: 'My Plan' } : { href: '/seller/staff?add=rider', label: 'Add a rider' };
    if (reason.code === 'license_pending' && reason.rider_id) return { href: `/seller/staff/${reason.rider_id}`, label: 'See license' };
    if (reason.rider_id) return { href: `/seller/staff/${reason.rider_id}`, label: 'Open rider' };
    return { href: '/seller/staff', label: 'Open Staff' };
}

/**
 * J4: a store without an approved rider or a delivery vehicle is no longer hidden — customers can only PICK UP.
 * This banner says so and lists what to fix (owner: a button per reason; staff: the text). A hidden store (plan ended,
 * document expired) keeps its own banners.
 */
export function StoreVisibilityBanner() {
    const { auth, storeVisibility } = usePage<SharedData & { storeVisibility?: StoreVisibility }>().props;
    if (!storeVisibility || !storeVisibility.visible || !storeVisibility.pickup_only) return null;
    const reasons = storeVisibility.delivery_reasons ?? [];
    if (reasons.length === 0) return null;

    const isOwner = auth.user?.role === 'seller';
    // K9: a Branch Manager adds riders and vehicles in their branch too (plans stay with the owner)
    const canFix = isOwner || !!auth.is_branch_manager;
    const full = reasons.some((r) => r.code === 'no_rider') && storeVisibility.staff_full;

    return (
        <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:mx-6" role="status">
            <p className="flex items-start gap-2">
                <Store className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    <strong>Customers can only PICK UP from your store</strong> until you add an approved rider and a delivery vehicle.
                    {full && ' Your staff limit is full — deactivate someone or upgrade your plan.'}
                    {!canFix && ' Ask your store owner to fix this.'}
                </span>
            </p>
            <ul className="mt-2 space-y-1.5 pl-6">
                {reasons.map((r) => {
                    const fix = fixFor(r, storeVisibility.staff_full);
                    return (
                        <li key={r.code} className="flex flex-wrap items-center gap-2">
                            <span>• {r.text}</span>
                            {canFix && !(fix.href === '/seller/plan' && !isOwner) && (
                                <Link href={fix.href} className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700">
                                    {fix.label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
