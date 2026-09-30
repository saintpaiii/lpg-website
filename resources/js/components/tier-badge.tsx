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
    new:     'bg-gray-100 text-gray-600 border-gray-200',
    regular: 'bg-blue-100 text-blue-700 border-blue-200',
    loyal:   'bg-purple-100 text-purple-700 border-purple-200',
    vip:     'bg-gradient-to-r from-amber-100 via-yellow-50 to-amber-100 text-amber-700 border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]',
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
