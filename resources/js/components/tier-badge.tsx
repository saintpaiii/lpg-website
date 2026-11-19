import { Crown } from 'lucide-react';

export type Tier = 'new' | 'regular' | 'loyal' | 'vip';

export const TIER_LABELS: Record<Tier, string> = { new: 'New', regular: 'Regular', loyal: 'Loyal', vip: 'VIP' };

/** Dot colour per tier (used next to settings inputs / previews). */
export const TIER_DOTS: Record<Tier, string> = {
    new:     'bg-gray-400',
    regular: 'bg-blue-500',
    loyal:   'bg-purple-500',
    vip:     'bg-amber-500',
};

const STYLES: Record<Tier, string> = {
    new:     'bg-muted text-muted-foreground border-border',
    regular: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    loyal:   'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    vip:     'bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 dark:from-amber-900/50 dark:via-yellow-900/40 dark:to-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]',
};

const SIZES = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5 font-semibold',
};

export default function TierBadge({ tier, size = 'md', showLabel = true }: { tier: Tier; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${STYLES[tier]} ${SIZES[size]}`} title={`${TIER_LABELS[tier]} tier`}>
            {tier === 'vip' && <Crown className={size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} />}
            {showLabel ? TIER_LABELS[tier] : <span className={`inline-block h-2 w-2 rounded-full ${TIER_DOTS[tier]}`} />}
        </span>
    );
}
