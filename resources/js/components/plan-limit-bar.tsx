import { Link, usePage } from '@inertiajs/react';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SharedData } from '@/types';

/** planLimit prop from the Seller Product / Staff / Vehicle controllers */
export type PlanLimit = { used: number; limit: number | null; plan: string; message: string; can_add: boolean };

export const PAUSED_BADGE = 'rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';

/** "Published 15 / 15 — Basic plan" — amber when full, with an Upgrade link for the owner. */
export function PlanLimitBar({ label, planLimit, className }: { label: string; planLimit?: PlanLimit | null; className?: string }) {
    const { auth } = usePage<SharedData>().props;
    if (!planLimit) return null;
    const { used, limit, plan } = planLimit;
    const full = limit != null && used >= limit;
    const pct = limit == null ? 100 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

    return (
        <div className={cn(
            'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 text-sm',
            full ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-card',
            className,
        )}>
            <span className="font-medium">
                {label} <span className="tabular-nums">{used} / {limit == null ? 'Unlimited' : limit}</span>
                <span className="text-muted-foreground"> — {plan} plan</span>
            </span>
            {limit != null && (
                <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', used > limit ? 'bg-red-500' : full ? 'bg-amber-500' : 'bg-blue-600')} style={{ width: `${pct}%` }} />
                </div>
            )}
            {full && (auth.user?.role === 'seller' ? (
                <Link href="/seller/plan" className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline dark:text-violet-300">
                    <Crown className="h-3.5 w-3.5" /> Upgrade
                </Link>
            ) : (
                <span className="text-xs">Ask your store owner to upgrade the plan.</span>
            ))}
        </div>
    );
}
