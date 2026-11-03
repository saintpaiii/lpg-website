/** Most one customer can put in one order: the stock, capped by the seller's max per order (null = no limit). */
export function maxQty(p: { stock: number; max_per_order?: number | null }): number {
    return Math.min(p.stock, p.max_per_order ?? Infinity);
}

/** "Max 2 per order" or null */
export function maxPerOrderLabel(p: { max_per_order?: number | null }): string | null {
    return p.max_per_order != null ? `Max ${p.max_per_order} per order` : null;
}
