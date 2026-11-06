import { AlertTriangle, CalendarPlus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/** SubscriptionService::previewPause */
export type PausePreview = {
    products: number;
    staff: number;
    vehicles: number;
    product_names: string[];
    staff_names: string[];
    vehicle_names: string[];
    locked_features: string[];
    hides_store?: boolean;
    usage: { products: number; staff: number; vehicles: number };
};

/** SubscriptionService::changePreview — what a plan payment would do to the store right now. */
export type PlanChange = {
    current: { plan_key: string; label: string; active: boolean; days_left: number; ends: string | null; ends_at: string | null };
    plan_key: string;
    plan: string;
    price: number;
    days: number;
    extends: boolean;
    new_end: string;
    downgrade: boolean;
    lost_days: number;
    preview: PausePreview | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Products: A, B +2 more" */
const names = (label: string, list: string[], total: number) =>
    total > 0 ? `${plural(total, label.toLowerCase().replace(/s$/, ''), label.toLowerCase())}${list.length ? ` (${list.join(', ')}${total > list.length ? ` +${total - list.length} more` : ''})` : ''}` : null;

/** "Your Free trial" / "Your Pro plan" */
const yourPlan = (c: PlanChange['current']) => (c.plan_key === 'trial' ? `Your ${c.label}` : `Your ${c.label} plan`);

/**
 * "What will change" — the same box on the admin's Record cash dialog and on the seller's
 * "Confirm your cash payment" card. Green = adds days, amber = replaces the plan, red = downgrade.
 */
export function PlanChangeBox({ change }: { change: PlanChange }) {
    const p = change.preview;
    const paused = p ? [names('Products', p.product_names, p.products), names('Staff accounts', p.staff_names, p.staff), names('Vehicles', p.vehicle_names, p.vehicles)].filter(Boolean) as string[] : [];

    if (change.extends) {
        return (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Adds {change.days} days → your plan ends <strong>{change.new_end}</strong>.</p>
            </div>
        );
    }

    const tone = change.downgrade
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200'
        : change.current.active
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
            : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200';

    return (
        <div className={cn('space-y-2 rounded-lg border px-3 py-2.5 text-sm', tone)}>
            <div className="flex items-start gap-2">
                {change.current.active ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
                <div className="min-w-0 space-y-1">
                    {change.downgrade && (
                        <span className="inline-block rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Downgrade</span>
                    )}
                    {change.current.active ? (
                        <p>
                            {yourPlan(change.current)} is replaced today
                            {change.lost_days > 0 && <>. The remaining <strong>{plural(change.lost_days, 'day', 'days')}</strong> are not carried over</>}
                            . New end date <strong>{change.new_end}</strong>.
                        </p>
                    ) : (
                        <p>The {change.plan} plan starts today and ends <strong>{change.new_end}</strong>.</p>
                    )}
                </div>
            </div>
            {p && (
                <ul className="space-y-0.5 pl-6 text-xs">
                    {paused.length > 0 && <li><strong>Will be paused:</strong> {paused.join('; ')}. Nothing is deleted.</li>}
                    {p.locked_features.length > 0 && <li><strong>Will lock:</strong> {p.locked_features.join(', ')}.</li>}
                    {p.hides_store && <li><strong>Your store will be hidden from customers</strong> (no rider left).</li>}
                </ul>
            )}
        </div>
    );
}
