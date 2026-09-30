<?php

namespace App\Services;

use App\Models\CustomerLoyalty;
use App\Models\Order;
use App\Models\Store;
use App\Models\StoreLoyaltySettings;

/**
 * Per-store customer loyalty: tiers, trust scores and tier-based consignment terms.
 * All updates happen automatically from order events — nothing here is seller-editable.
 */
class LoyaltyService
{
    public const TIER_LABELS = ['new' => 'New', 'regular' => 'Regular', 'loyal' => 'Loyal', 'vip' => 'VIP'];

    /** Enabled settings for a store, or null when the store hasn't opted in. */
    public static function enabledSettings(?int $storeId): ?StoreLoyaltySettings
    {
        if (! $storeId) {
            return null;
        }

        return StoreLoyaltySettings::where('store_id', $storeId)->where('is_enabled', true)->first();
    }

    /** The platform user behind an order (walk-in customers without an account are skipped). */
    private static function userIdFor(Order $order): ?int
    {
        $order->loadMissing('customer');
        return $order->customer?->user_id ? (int) $order->customer->user_id : null;
    }

    // ── Checkout ──────────────────────────────────────────────────────────────

    /**
     * Consignment terms for a customer at a store. Consignment is a loyalty benefit:
     * it is only offered when the store runs a loyalty program AND the customer's
     * trust score meets the store's minimum. The down payment % is tier-based.
     *
     * Nothing is written here — first-time customers get default terms without a record being created.
     *
     * blocked_reason: null | 'loyalty_disabled' | 'low_trust'
     */
    public static function getConsignmentTerms(int $storeId, int $userId): array
    {
        $settings = static::enabledSettings($storeId);

        if (! $settings) {
            return [
                'loyalty_enabled'     => false,
                'tier'                => null,
                'trust_score'         => null,
                'downpayment_percent' => null,
                'consignment_allowed' => false,
                'blocked_reason'      => 'loyalty_disabled',
            ];
        }

        $loyalty = CustomerLoyalty::where('user_id', $userId)->where('store_id', $storeId)->first()
            ?? new CustomerLoyalty(['user_id' => $userId, 'store_id' => $storeId]);

        $allowed = (float) $loyalty->trust_score >= (float) $settings->min_trust_score_for_consignment;

        return [
            'loyalty_enabled'     => true,
            'tier'                => $loyalty->tier,
            'trust_score'         => (float) $loyalty->trust_score,
            'downpayment_percent' => $allowed ? $loyalty->getDownpaymentPercent($settings) : null,
            'consignment_allowed' => $allowed,
            'blocked_reason'      => $allowed ? null : 'low_trust',
        ];
    }

    // ── Order hooks ───────────────────────────────────────────────────────────

    /** Hook 1: order delivered. Counts once per order. */
    public static function recordDelivered(Order $order): void
    {
        if ($order->loyalty_recorded_at || $order->status !== 'delivered') {
            return;
        }

        $settings = static::enabledSettings($order->store_id);
        $userId   = static::userIdFor($order);
        if (! $settings || ! $userId) {
            return;
        }

        $order->loadMissing(['items', 'store']);
        // Product subtotal only — never the delivery fee (same basis as commission)
        $productSubtotal = round((float) $order->items->sum('subtotal') - (float) $order->discount_amount, 2);
        if ($productSubtotal <= 0) {
            return; // e.g. ₱0 refund replacement orders don't earn loyalty
        }

        $loyalty = CustomerLoyalty::firstOrCreate(['user_id' => $userId, 'store_id' => $order->store_id], ['trust_score' => 50.00]);
        $loyalty->total_orders += 1;
        $loyalty->total_spent   = round((float) $loyalty->total_spent + $productSubtotal, 2);
        $loyalty->last_order_at = now();
        $loyalty->calculateTrustScore();
        $newTier = $loyalty->checkTierPromotion($settings);
        $loyalty->save();

        $order->forceFill(['loyalty_recorded_at' => now()])->saveQuietly();

        if ($newTier) {
            static::notifyPromotion($loyalty, $settings, $order->store);
        }
    }

    /**
     * Hook 2: order cancelled. Only customer-initiated cancellations count against
     * the customer — a seller cancelling (e.g. out of stock) is not the customer's fault.
     */
    public static function recordCancelled(Order $order): void
    {
        if ($order->cancelled_by !== 'customer') {
            return;
        }

        $settings = static::enabledSettings($order->store_id);
        $userId   = static::userIdFor($order);
        if (! $settings || ! $userId) {
            return;
        }

        // A first cancellation still creates the record, so it is reflected in the trust score
        $loyalty = CustomerLoyalty::firstOrCreate(['user_id' => $userId, 'store_id' => $order->store_id], ['trust_score' => 50.00]);
        $loyalty->cancelled_orders += 1;
        $loyalty->calculateTrustScore();
        $oldTier = $loyalty->checkTierDemotion($settings);
        $loyalty->save();

        if ($oldTier) {
            static::notifyDemotion($loyalty, $order->store ?? Store::find($order->store_id));
        }
    }

    /** Hook 3: consignment balance fully paid — on time if paid by the end of the due date. */
    public static function recordBalancePaid(Order $order): void
    {
        if ($order->payment_mode !== 'consignment') {
            return;
        }

        $settings = static::enabledSettings($order->store_id);
        $userId   = static::userIdFor($order);
        if (! $settings || ! $userId) {
            return;
        }

        $loyalty = CustomerLoyalty::firstOrCreate(['user_id' => $userId, 'store_id' => $order->store_id], ['trust_score' => 50.00]);
        $isLate  = $order->balance_due_date && now()->gt($order->balance_due_date->copy()->endOfDay());

        $oldTier = null;
        if ($isLate) {
            $loyalty->late_payments += 1;
            $loyalty->calculateTrustScore();
            $oldTier = $loyalty->checkTierDemotion($settings);
        } else {
            $loyalty->on_time_payments += 1;
            $loyalty->calculateTrustScore();
        }
        $loyalty->save();

        if ($oldTier) {
            static::notifyDemotion($loyalty, Store::find($order->store_id));
        }
    }

    /**
     * Daily upkeep: trust scores decay with inactivity (recency), and inactive
     * or low-trust customers drop a tier. Returns the number of demotions.
     */
    public static function refreshAll(): int
    {
        $demoted = 0;

        StoreLoyaltySettings::where('is_enabled', true)->with('store')->each(function (StoreLoyaltySettings $settings) use (&$demoted) {
            // Suspended stores are frozen: no tier changes while they can't take orders
            if (! $settings->store || $settings->store->status !== 'approved' || $settings->store->commission_suspended) {
                return;
            }

            CustomerLoyalty::where('store_id', $settings->store_id)->each(function (CustomerLoyalty $loyalty) use ($settings, &$demoted) {
                $loyalty->calculateTrustScore();
                $oldTier = $loyalty->checkTierDemotion($settings);
                if ($loyalty->isDirty()) {
                    $loyalty->save();
                }
                if ($oldTier) {
                    $demoted++;
                    static::notifyDemotion($loyalty, $settings->store);
                }
            });
        });

        return $demoted;
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private static function notifyPromotion(CustomerLoyalty $loyalty, StoreLoyaltySettings $settings, ?Store $store): void
    {
        $tier = static::TIER_LABELS[$loyalty->tier];
        $dp   = $loyalty->getDownpaymentPercent($settings);

        NotificationService::send($loyalty->user_id, 'loyalty_promotion', "You're now {$tier} at {$store?->store_name}!",
            "Congratulations! You've reached {$tier} status at {$store?->store_name}. You now enjoy {$dp}% minimum down payment on consignment orders!",
            ['store_id' => $loyalty->store_id, 'link' => '/customer/loyalty']);
    }

    private static function notifyDemotion(CustomerLoyalty $loyalty, ?Store $store): void
    {
        $tier = static::TIER_LABELS[$loyalty->tier];

        NotificationService::send($loyalty->user_id, 'loyalty_demotion', 'Loyalty Tier Changed',
            "Your loyalty tier at {$store?->store_name} has changed to {$tier}. Complete more orders to regain your previous benefits.",
            ['store_id' => $loyalty->store_id, 'link' => '/customer/loyalty']);
    }
}
