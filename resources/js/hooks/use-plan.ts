import { usePage } from '@inertiajs/react';
import type { SharedData } from '@/types';

/**
 * The store's plan (shared 'plan' prop) and has(feature). Without a store (admin, customer) nothing is locked —
 * the server-side plan.feature middleware is the real lock.
 */
export function usePlan() {
    const plan = usePage<SharedData>().props.plan ?? null;

    return {
        plan,
        has: (feature: string) => !plan || plan.features.includes(feature),
    };
}
