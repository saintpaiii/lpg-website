/**
 * Seller's "Max per customer" limit: per order (the cart line), per day (Manila calendar day) or per week
 * (rolling 7 days, earlier orders count). The server sends, for a logged-in customer:
 *   in_cart          — how many are in the cart now
 *   bought_in_period — bought earlier today / this week (0 for per order)
 *   limit_remaining  — how many more they can ADD (max − bought − in cart); null = no limit
 *   limit_resets_at  — per week, when nothing is left: when the oldest counted order turns 7 days old
 */
export type LimitPeriod = 'order' | 'day' | 'week';

export type LimitInfo = {
    stock: number;
    max_per_order?: number | null;
    limit_period?: LimitPeriod;
    in_cart?: number;
    bought_in_period?: number;
    limit_remaining?: number | null;
    limit_resets_at?: string | null;
};

/** Most one cart line (= one order) can hold: the stock, capped by the max minus what was bought in the period. */
export function maxQty(p: LimitInfo): number {
    const cap = p.max_per_order != null ? p.max_per_order - (p.bought_in_period ?? 0) : Infinity;
    return Math.max(0, Math.min(p.stock, cap));
}

/** Most the customer can still ADD (Add to Cart popups, product page): stock and limit minus what is in the cart. */
export function maxAdd(p: LimitInfo): number {
    const inCart = p.in_cart ?? 0;
    const limitLeft = p.limit_remaining ?? (p.max_per_order != null ? p.max_per_order - inCart : Infinity);
    return Math.max(0, Math.min(p.stock - inCart, limitLeft));
}

/** "Max 5 per day" / "per week" / "per order", or null */
export function limitLabel(p: Pick<LimitInfo, 'max_per_order' | 'limit_period'>): string | null {
    return p.max_per_order != null ? `Max ${p.max_per_order} per ${p.limit_period ?? 'order'}` : null;
}

/** Old name, kept for existing imports. */
export const maxPerOrderLabel = limitLabel;

function periodWord(p: LimitInfo): string {
    return p.limit_period === 'week' ? 'this week' : 'today';
}

/** "You already bought 3 today · 2 left" / "You already have 5 in your cart" (null when nothing to say). */
export function limitStatus(p: LimitInfo): string | null {
    if (p.max_per_order == null) return null;
    const bought = p.bought_in_period ?? 0;
    const inCart = p.in_cart ?? 0;
    const parts: string[] = [];
    if (bought > 0) parts.push(`You already bought ${bought} ${periodWord(p)}`);
    if (inCart > 0) parts.push(`You already have ${inCart} in your cart`);
    if (parts.length && (p.limit_remaining ?? 0) > 0) parts.push(`${p.limit_remaining} left`);
    return parts.length ? parts.join(' · ') : null;
}

/** Why Add to Cart is disabled because of the limit (null when the customer can still add some). */
export function limitReachedText(p: LimitInfo): string | null {
    if (p.max_per_order == null || p.limit_remaining == null || p.limit_remaining > 0) return null;
    const bought = p.bought_in_period ?? 0;
    if (p.limit_period === 'day' && bought > 0) return 'Limit reached for today — try again tomorrow';
    if (p.limit_period === 'week' && bought > 0) {
        return p.limit_resets_at
            ? `Limit reached for this week — you can buy more after ${p.limit_resets_at}`
            : 'Limit reached for this week';
    }
    return `You already have the maximum (${p.max_per_order}) per ${p.limit_period === 'order' || !p.limit_period ? 'order' : p.limit_period} in your cart`;
}

/** Cart / checkout warning for a line over the limit. */
export function overLimitText(p: LimitInfo, action = 'reduce the quantity to continue'): string {
    const left = Math.max(0, (p.max_per_order ?? 0) - (p.bought_in_period ?? 0));
    const bought = p.bought_in_period ?? 0;
    return `Max ${p.max_per_order} per ${p.limit_period ?? 'order'}`
        + (bought > 0 ? ` — you already bought ${bought} ${periodWord(p)}, ${left} left` : '')
        + ` — ${left === 0 && bought > 0 ? 'remove it to continue' : action}`;
}
