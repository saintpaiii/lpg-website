// Coupon types and discount math — mirrors app/Services/CouponService.php.
// Keep both in sync: the server recomputes the discount when the order is placed.

export type CouponScope = 'product' | 'shipping' | 'both';
export type DiscountType = 'percentage' | 'fixed';

export type CouponRules = {
    id?: number;
    code: string;
    type: 'platform' | 'store';
    store_id: number | null;
    store_name?: string | null;
    scope: CouponScope;
    discount_type: DiscountType;
    discount_value: number;
    min_order_amount: number;
    max_discount_amount: number | null;
    label?: string;
    excluded_store_ids?: number[];
};

export type Discount = { product: number; shipping: number; total: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Discount for one product amount + delivery fee. */
export function calculateDiscount(c: Pick<CouponRules, 'scope' | 'discount_type' | 'discount_value' | 'max_discount_amount'>, product: number, shipping: number): Discount {
    product = Math.max(0, product);
    shipping = Math.max(0, shipping);

    const base = c.scope === 'shipping' ? shipping : c.scope === 'both' ? product + shipping : product;

    let discount = c.discount_type === 'percentage' ? (base * c.discount_value) / 100 : c.discount_value;
    if (c.discount_type === 'percentage' && c.max_discount_amount != null && c.max_discount_amount > 0) {
        discount = Math.min(discount, c.max_discount_amount);
    }
    discount = r2(Math.min(Math.max(0, discount), base));

    const prodPart = c.scope === 'shipping' ? 0 : c.scope === 'both' ? r2(Math.min(discount, product)) : discount;

    return { product: prodPart, shipping: r2(discount - prodPart), total: discount };
}

/** Spread a coupon across the stores of a checkout (store coupons only hit their store). */
export function allocateDiscount(c: CouponRules, parts: Record<number, { product: number; shipping: number }>): Record<number, Discount> {
    const result: Record<number, Discount> = {};
    for (const id of Object.keys(parts)) result[Number(id)] = { product: 0, shipping: 0, total: 0 };

    const excluded = c.excluded_store_ids ?? [];
    const eligibleIds = Object.keys(parts).map(Number)
        .filter((id) => (c.type === 'store' ? id === c.store_id : !excluded.includes(id)));
    if (eligibleIds.length === 0) return result;

    const sum = (f: 'product' | 'shipping') => eligibleIds.reduce((s, id) => s + parts[id][f], 0);
    const overall = calculateDiscount(c, sum('product'), sum('shipping'));

    (['product', 'shipping'] as const).forEach((f) => {
        const total = sum(f);
        const toSpread = overall[f];
        if (toSpread <= 0 || total <= 0) return;
        let remaining = toSpread;
        eligibleIds.forEach((id, i) => {
            let share = i === eligibleIds.length - 1 ? remaining : r2((toSpread * parts[id][f]) / total);
            share = Math.min(share, parts[id][f]);
            result[id][f] = share;
            remaining = r2(remaining - share);
        });
    });

    for (const id of Object.keys(result)) {
        const d = result[Number(id)];
        d.total = r2(d.product + d.shipping);
    }
    return result;
}

/** Who pays for a discount — platform coupons are shared, store coupons are all the store's. */
export function splitCost(type: 'platform' | 'store', discount: number, adminSharePercent: number) {
    const admin = type === 'platform' ? r2((discount * Math.min(100, Math.max(0, adminSharePercent))) / 100) : 0;
    return { admin, seller: r2(discount - admin) };
}

export function couponLabel(c: Pick<CouponRules, 'scope' | 'discount_type' | 'discount_value' | 'max_discount_amount'>): string {
    const value = c.discount_type === 'percentage' ? `${+c.discount_value}%` : peso(c.discount_value);
    const target = c.scope === 'shipping' ? ' off delivery' : c.scope === 'both' ? ' off order + delivery' : ' off';
    const cap = c.discount_type === 'percentage' && c.max_discount_amount ? ` (max ${peso(c.max_discount_amount)})` : '';
    return value + target + cap;
}

export function peso(n: number) {
    return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
