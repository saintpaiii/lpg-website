<?php

namespace App\Services;

use App\Models\Coupon;
use App\Models\CouponUse;
use App\Models\Store;

/**
 * Coupon validation and discount math. The same rules are mirrored in
 * resources/js/lib/coupons.ts for the live checkout total and the
 * admin/seller preview calculator — keep both in sync.
 */
class CouponService
{
    /**
     * Find and validate a coupon for a checkout.
     *
     * @param  array<int, float>  $productTotals  store_id => items total (after any store refund discount)
     * @throws CouponException with a customer-facing reason
     */
    public static function validate(string $code, int $userId, array $productTotals, bool $lock = false): Coupon
    {
        $query = Coupon::with('store')->where('code', strtoupper(trim($code)));
        if ($lock) {
            $query->lockForUpdate();
        }
        $coupon = $query->first();

        if (! $coupon || ! $coupon->is_active) {
            throw new CouponException('This coupon code is not valid.');
        }
        if ($coupon->starts_at && $coupon->starts_at->isFuture()) {
            throw new CouponException('This coupon is not active yet. It starts on ' . $coupon->starts_at->format('M d, Y') . '.');
        }
        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            throw new CouponException('This coupon has expired.');
        }
        if ($coupon->max_uses !== null && $coupon->used_count >= $coupon->max_uses) {
            throw new CouponException('Usage limit reached for this coupon.');
        }

        $userUses = static::usesByUser($coupon->id, $userId);
        if ($userUses >= max(1, (int) $coupon->max_uses_per_user)) {
            throw new CouponException($coupon->max_uses_per_user > 1
                ? "You've already used this coupon {$userUses} time(s), the maximum allowed."
                : "You've already used this coupon.");
        }

        if ($coupon->type === 'store') {
            if (! $coupon->store || ! array_key_exists($coupon->store_id, $productTotals)) {
                $name = $coupon->store?->store_name ?? 'another store';
                throw new CouponException("This coupon is only valid at {$name}.");
            }
            if ($coupon->store->status !== 'approved' || $coupon->store->commission_suspended) {
                throw new CouponException('This coupon is not available right now.');
            }
        }

        // Platform coupon: stores that opted out of the promo are not eligible
        if ($coupon->type === 'platform') {
            $excluded = array_intersect(array_keys($productTotals), $coupon->excludedStoreIds());
            if ($excluded && count($excluded) === count($productTotals)) {
                $names = \App\Models\Store::whereIn('id', $excluded)->pluck('store_name')->implode(', ');
                throw new CouponException("Not valid at {$names} — this store is not participating in the promo.");
            }
        }

        $eligibleProduct = static::eligibleProductTotal($coupon, $productTotals);
        if ((float) $coupon->min_order_amount > 0 && $eligibleProduct < (float) $coupon->min_order_amount) {
            $where = $coupon->type === 'store' ? " at {$coupon->store->store_name}" : '';
            throw new CouponException('Minimum order of ₱' . number_format((float) $coupon->min_order_amount, 2) . " required{$where}.");
        }

        return $coupon;
    }

    /** Items total the coupon's minimum order is measured against. */
    public static function eligibleProductTotal(Coupon $coupon, array $productTotals): float
    {
        return (float) array_sum(array_intersect_key($productTotals, array_flip(static::eligibleStoreIds($coupon, array_keys($productTotals)))));
    }

    /**
     * Stores in the checkout the coupon can discount: the coupon's own store,
     * or for platform coupons every store that has not opted out.
     *
     * @param  int[]  $storeIds
     * @return int[]
     */
    public static function eligibleStoreIds(Coupon $coupon, array $storeIds): array
    {
        if ($coupon->type === 'store') {
            return in_array($coupon->store_id, $storeIds) ? [(int) $coupon->store_id] : [];
        }

        return array_values(array_diff($storeIds, $coupon->excludedStoreIds()));
    }

    /** Checkouts (not orders) in which the user used this coupon. */
    public static function usesByUser(int $couponId, int $userId): int
    {
        return (int) CouponUse::where('coupon_id', $couponId)->where('user_id', $userId)
            ->selectRaw('COUNT(DISTINCT COALESCE(checkout_ref, id)) as n')
            ->value('n');
    }

    /**
     * Who pays for a discount. Platform coupons are shared by admin_share_percent;
     * store coupons are funded entirely by the store.
     *
     * @return array{admin: float, seller: float}
     */
    public static function split(Coupon $coupon, float $discount): array
    {
        $admin = $coupon->type === 'platform'
            ? round($discount * max(0, min(100, (int) $coupon->admin_share_percent)) / 100, 2)
            : 0.0;

        return ['admin' => $admin, 'seller' => round($discount - $admin, 2)];
    }

    /** Commission rate for an order using this coupon (promo rate for platform coupons). */
    public static function promoCommissionRate(Coupon $coupon, float $normalRate): float
    {
        return $coupon->type === 'platform' && $coupon->seller_commission_during_promo !== null
            ? (float) $coupon->seller_commission_during_promo
            : $normalRate;
    }

    /**
     * Total discount for the given product and shipping amounts.
     *
     * @return array{product: float, shipping: float, total: float}
     */
    public static function calculate(Coupon $coupon, float $product, float $shipping): array
    {
        $product  = max(0, $product);
        $shipping = max(0, $shipping);

        $base = match ($coupon->scope) {
            'shipping' => $shipping,
            'both'     => $product + $shipping,
            default    => $product,
        };

        $discount = $coupon->discount_type === 'percentage'
            ? $base * (float) $coupon->discount_value / 100
            : (float) $coupon->discount_value;

        if ($coupon->discount_type === 'percentage' && $coupon->max_discount_amount !== null) {
            $discount = min($discount, (float) $coupon->max_discount_amount);
        }

        $discount = round(min($discount, $base), 2);

        // Split between product and delivery fee (product first for 'both')
        $prodPart = match ($coupon->scope) {
            'shipping' => 0.0,
            'both'     => round(min($discount, $product), 2),
            default    => $discount,
        };

        return [
            'product'  => $prodPart,
            'shipping' => round($discount - $prodPart, 2),
            'total'    => $discount,
        ];
    }

    /**
     * Spread a coupon's discount over the orders of a (possibly multi-store) checkout.
     *
     * @param  array<int, array{product: float, shipping: float}>  $parts  store_id => amounts
     * @return array<int, array{product: float, shipping: float, total: float}>  store_id => discount
     */
    public static function allocate(Coupon $coupon, array $parts): array
    {
        $eligible = array_intersect_key($parts, array_flip(static::eligibleStoreIds($coupon, array_keys($parts))));

        $result = array_map(fn () => ['product' => 0.0, 'shipping' => 0.0, 'total' => 0.0], $parts);
        if (empty($eligible)) {
            return $result;
        }

        $totalProduct  = array_sum(array_column($eligible, 'product'));
        $totalShipping = array_sum(array_column($eligible, 'shipping'));
        $overall       = static::calculate($coupon, $totalProduct, $totalShipping);

        foreach (['product' => $totalProduct, 'shipping' => $totalShipping] as $field => $sum) {
            $toSpread = $overall[$field];
            if ($toSpread <= 0 || $sum <= 0) {
                continue;
            }
            $keys      = array_keys($eligible);
            $remaining = $toSpread;
            foreach ($keys as $i => $storeId) {
                $share = $i === array_key_last($keys)
                    ? $remaining
                    : round($toSpread * $eligible[$storeId][$field] / $sum, 2);
                $share = min($share, $eligible[$storeId][$field]);
                $result[$storeId][$field] = $share;
                $remaining = round($remaining - $share, 2);
            }
        }

        foreach ($result as $storeId => $r) {
            $result[$storeId]['total'] = round($r['product'] + $r['shipping'], 2);
        }

        return $result;
    }

    /** Rules sent to the browser so it can recompute the discount live. */
    public static function toClient(Coupon $coupon): array
    {
        return [
            'id'                  => $coupon->id,
            'code'                => $coupon->code,
            'type'                => $coupon->type,
            'store_id'            => $coupon->store_id,
            'store_name'          => $coupon->store?->store_name,
            'scope'               => $coupon->scope,
            'discount_type'       => $coupon->discount_type,
            'discount_value'      => (float) $coupon->discount_value,
            'min_order_amount'    => (float) $coupon->min_order_amount,
            'max_discount_amount' => $coupon->max_discount_amount !== null ? (float) $coupon->max_discount_amount : null,
            'label'               => $coupon->label(),
            'excluded_store_ids'  => $coupon->excludedStoreIds(),
        ];
    }

    // ── Visibility boost ──────────────────────────────────────────────────────

    /**
     * Stores participating in a running, featured platform promotion.
     *
     * @return array<int, string>  store_id => promo code (first matching promo)
     */
    public static function promoStoreCodes(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }

        $promos = Coupon::runningPlatform()->where('featured_boost', true)->with('exclusions')->orderBy('created_at')->get();
        if ($promos->isEmpty()) {
            return $cache = [];
        }

        $storeIds = Store::visibleToCustomers()->pluck('id');
        $map = [];
        foreach ($promos as $promo) {
            $excluded = $promo->exclusions->pluck('store_id')->all();
            foreach ($storeIds as $id) {
                if (! isset($map[$id]) && ! in_array($id, $excluded)) {
                    $map[$id] = $promo->code;
                }
            }
        }

        return $cache = $map;
    }

    // ── Announcements ─────────────────────────────────────────────────────────

    /** Notify the right customers about a newly available coupon. */
    public static function announce(Coupon $coupon): void
    {
        if (! $coupon->is_active || $coupon->state() === 'expired') {
            return;
        }

        $when = $coupon->starts_at && $coupon->starts_at->isFuture()
            ? ' Starts ' . $coupon->starts_at->format('M d') . '.'
            : '';
        $until = $coupon->expires_at ? ' Valid until ' . $coupon->expires_at->format('M d, Y') . '.' : '';

        if ($coupon->type === 'platform') {
            NotificationService::sendToRole('customer', 'promo', 'New Promo!',
                "Use code {$coupon->code} for {$coupon->label()}!{$when}{$until}",
                ['coupon_code' => $coupon->code, 'link' => '/customer/products']);

            $rate = $coupon->seller_commission_during_promo !== null
                ? ' Commission during the promo: ' . rtrim(rtrim(number_format((float) $coupon->seller_commission_during_promo, 2), '0'), '.') . '%.'
                : '';
            NotificationService::sendToRole('seller', 'promo', 'New Platform Promotion',
                "New promotion {$coupon->code} ({$coupon->label()}). The platform covers {$coupon->admin_share_percent}% of the discount.{$rate} Review and choose whether to participate — you're opted in by default.",
                ['coupon_code' => $coupon->code, 'link' => '/seller/coupons?tab=platform']);
            return;
        }

        $store = $coupon->store ?? Store::find($coupon->store_id);
        NotificationService::sendToMany(static::storeCustomerUserIds($coupon->store_id), 'promo',
            "New Promo from {$store?->store_name}!",
            "Use code {$coupon->code} for {$coupon->label()} at {$store?->store_name}.{$when}{$until}",
            ['coupon_code' => $coupon->code, 'link' => '/customer/store/' . $coupon->store_id]);
    }

    /** User ids of customers who have ordered from the store. */
    public static function storeCustomerUserIds(int $storeId): array
    {
        return \App\Models\Customer::whereIn('id', \App\Models\Order::where('store_id', $storeId)->distinct()->pluck('customer_id'))
            ->whereNotNull('user_id')
            ->pluck('user_id')
            ->all();
    }
}
