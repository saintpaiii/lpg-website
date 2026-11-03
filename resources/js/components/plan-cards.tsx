import { Check, Crown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CatalogPlan, PlanCatalog, PlanKey } from '@/types/plans';

export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const limitText = (n: number | null, noun: string) => (n == null ? `Unlimited ${noun}` : `Up to ${n} ${noun}`);

/**
 * Basic / Pro / Premium side by side. Used by My Plan, the plan-expiry popup, the landing Pricing section and the
 * "See plans and prices" dialogs. Without renderAction the cards have no buttons.
 */
export function PlanCards({ catalog, currentKey, renderAction, className }: {
    catalog: PlanCatalog;
    /** Highlights the store's current (active) plan */
    currentKey?: string | null;
    renderAction?: (plan: CatalogPlan) => React.ReactNode;
    className?: string;
}) {
    const extras = Object.entries(catalog.feature_labels);

    return (
        <div className={cn('grid gap-4 md:grid-cols-3', className)}>
            {catalog.plans.map((plan) => {
                const current = currentKey === plan.key;
                const popular = plan.key === 'pro';
                return (
                    <div
                        key={plan.key}
                        className={cn(
                            'relative flex flex-col rounded-xl border bg-card p-5 shadow-sm',
                            current ? 'border-blue-500 ring-2 ring-blue-500/30' : popular ? 'border-violet-300 dark:border-violet-700' : 'border-border',
                        )}
                    >
                        {popular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
                                Most popular
                            </span>
                        )}
                        {current && (
                            <span className="absolute right-3 top-3 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                Current plan
                            </span>
                        )}

                        <p className="flex items-center gap-1.5 text-lg font-bold">
                            {plan.key === 'premium' && <Crown className="h-4 w-4 text-amber-500" />}
                            {plan.name}
                        </p>
                        <p className="mt-1">
                            <span className="text-3xl font-extrabold tracking-tight">{peso(plan.price)}</span>
                            <span className="text-sm text-muted-foreground"> / {catalog.days} days</span>
                        </p>

                        <ul className="mt-4 space-y-1.5 text-sm">
                            <li className="font-medium">{limitText(plan.limits.products, 'published products')}</li>
                            <li className="font-medium">{limitText(plan.limits.staff, 'staff accounts')}</li>
                            <li className="font-medium">{limitText(plan.limits.vehicles, 'vehicles')}</li>
                        </ul>

                        <ul className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                            {catalog.core_features.map((f) => (
                                <li key={f} className="flex items-start gap-2">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {f}
                                </li>
                            ))}
                            {extras.map(([key, label]) => {
                                const has = plan.features.includes(key);
                                return (
                                    <li key={key} className={cn('flex items-start gap-2', !has && 'text-muted-foreground')}>
                                        {has
                                            ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                            : <X className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
                                        <span className={cn(!has && 'line-through decoration-gray-300')}>{label}</span>
                                    </li>
                                );
                            })}
                        </ul>

                        {renderAction && <div className="mt-5 pt-1">{renderAction(plan)}</div>}
                    </div>
                );
            })}
        </div>
    );
}

/** Small button helper for the cards. */
export function PlanCardButton({ children, onClick, href, variant = 'default', disabled }: {
    children: React.ReactNode;
    onClick?: () => void;
    href?: string;
    variant?: 'default' | 'outline';
    disabled?: boolean;
}) {
    const cls = 'w-full';
    if (href) {
        return <Button asChild variant={variant} className={cls}><a href={href}>{children}</a></Button>;
    }
    return <Button type="button" variant={variant} className={cls} onClick={onClick} disabled={disabled}>{children}</Button>;
}

export const PLAN_KEYS: PlanKey[] = ['basic', 'pro', 'premium'];
