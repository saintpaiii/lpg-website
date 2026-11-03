import type { PlanSummary } from '@/types/plans';

/** Trial / Active / Ends soon (≤ 3 days) / Expired / No plan — badge text + colours. */
export function planStatus(plan: PlanSummary): { label: string; cls: string } {
    if (!plan.active) return plan.last_key === 'none'
        ? { label: 'No plan', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' }
        : { label: 'Expired', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' };
    if (plan.days_left <= 3) return { label: 'Ends soon', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
    if (plan.is_trial) return { label: 'Trial', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
    return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
}

/** Admin status keys from Admin\SubscriptionController::statusOf */
export const ADMIN_PLAN_STATUS: Record<string, { label: string; cls: string }> = {
    trial:   { label: 'Trial',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    active:  { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    ending:  { label: 'Ends soon', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    expired: { label: 'Expired',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    none:    { label: 'No plan',   cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

/** Does the owner need a plan reminder (banner / popup / sidebar "!")? */
export function planNeedsAttention(plan: PlanSummary | null | undefined): 'ending' | 'expired' | null {
    if (!plan) return null;
    if (!plan.active) return 'expired';
    return plan.days_left <= 3 ? 'ending' : null;
}

/** Locked features: lowest plan that has it + one line of what it does (mirrors config/plans.php). */
export const FEATURE_INFO: Record<string, { label: string; plan: 'Pro' | 'Premium'; key: 'pro' | 'premium'; what: string }> = {
    export:       { label: 'Export (CSV/PDF)',   plan: 'Pro',     key: 'pro',     what: 'Download your orders, invoices, attendance, payroll and reports as CSV or PDF.' },
    coupons:      { label: 'Store coupons',      plan: 'Pro',     key: 'pro',     what: 'Create discount codes for your customers and announce them automatically.' },
    loyalty:      { label: 'Loyalty program',    plan: 'Pro',     key: 'pro',     what: 'Customer tiers, trust scores and consignment (pay later) terms for loyal customers.' },
    payroll:      { label: 'Payroll',            plan: 'Pro',     key: 'pro',     what: 'Generate payslips from attendance and track released and paid salaries.' },
    custom_roles: { label: 'Custom staff roles', plan: 'Pro',     key: 'pro',     what: 'Create your own staff roles with the permissions you choose.' },
    dss:          { label: 'DSS insights',       plan: 'Premium', key: 'premium', what: 'Demand forecasts, restock suggestions and smart insights for your store.' },
    featured:     { label: 'Featured badge',     plan: 'Premium', key: 'premium', what: 'A Featured badge and top placement in Browse and Find a Store.' },
};

/** Open the upgrade dialog (mounted once in the seller layout). */
export function openUpgrade(feature: string) {
    window.dispatchEvent(new CustomEvent('open-upgrade', { detail: { feature } }));
}
