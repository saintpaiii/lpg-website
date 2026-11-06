import { Link, usePage } from '@inertiajs/react';
import { AlertTriangle, Crown, HandCoins } from 'lucide-react';
import { planNeedsAttention } from '@/lib/plans';
import type { SharedData } from '@/types';

/**
 * Store owner only: amber when the plan ends within 3 days, red when it has ended (products hidden).
 * Not shown on My Plan itself.
 */
export function PlanStatusBanner() {
    const { auth, plan, cash_request_waiting } = usePage<SharedData>().props;
    const state = planNeedsAttention(plan);
    const onPlanPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/seller/plan');

    if (auth.user?.role !== 'seller' || onPlanPage) return null;

    // A cash payment from the platform waits for the owner — that comes first (no "Choose a plan / Renew now")
    if (cash_request_waiting) {
        return (
            <div className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <HandCoins className="h-4 w-4 shrink-0" />
                <p className="min-w-0 flex-1">The platform recorded a cash payment for your plan — please review it in My Plan.</p>
                <Link href="/seller/plan" className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">Review it</Link>
            </div>
        );
    }

    if (!plan || !state) return null;

    if (state === 'expired') {
        return (
            <div className="flex flex-wrap items-center gap-3 border-b border-red-300 bg-red-600 px-4 py-2.5 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="flex-1 font-medium">Your plan has ended — your products are hidden from customers.</p>
                <Link href="/seller/plan" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Choose a plan</Link>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <Crown className="h-4 w-4 shrink-0" />
            <p className="flex-1">
                Your {plan.name} plan ends in {plan.days_left} day{plan.days_left === 1 ? '' : 's'} ({plan.expires_label}).
            </p>
            <Link href="/seller/plan" className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">Renew now</Link>
        </div>
    );
}
