<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A customer's loyalty standing at ONE store (tiers are per-store).
 * Everything here is system-calculated — sellers cannot edit tiers or scores.
 */
class CustomerLoyalty extends Model
{
    use SoftDeletes;

    protected $table = 'customer_loyalty';

    public const TIERS = ['new', 'regular', 'loyal', 'vip'];

    protected $fillable = [
        'user_id',
        'store_id',
        'tier',
        'total_orders',
        'total_spent',
        'cancelled_orders',
        'late_payments',
        'on_time_payments',
        'trust_score',
        'tier_achieved_at',
        'last_order_at',
    ];

    protected $attributes = [
        'tier'             => 'new',
        'total_orders'     => 0,
        'total_spent'      => 0,
        'cancelled_orders' => 0,
        'late_payments'    => 0,
        'on_time_payments' => 0,
        'trust_score'      => 50.00,
    ];

    protected function casts(): array
    {
        return [
            'tier_achieved_at' => 'datetime',
            'last_order_at'    => 'datetime',
            'trust_score'      => 'decimal:2',
            'total_spent'      => 'decimal:2',
            'total_orders'     => 'integer',
            'cancelled_orders' => 'integer',
            'late_payments'    => 'integer',
            'on_time_payments' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /**
     * Recalculate the 0–100 trust score:
     * 40 completion rate · 30 payment punctuality · 15 spending (caps at ₱10,000) · 15 recency.
     */
    public function calculateTrustScore(): void
    {
        $totalAttempts = $this->total_orders + $this->cancelled_orders;

        $completionRate = $totalAttempts > 0
            ? ($this->total_orders / $totalAttempts) * 40
            : 20; // neutral for new customers

        $totalPayments = $this->on_time_payments + $this->late_payments;
        $paymentScore = $totalPayments > 0
            ? ($this->on_time_payments / $totalPayments) * 30
            : 15; // neutral for new customers

        $spendingScore = min((float) $this->total_spent / 10000, 1) * 15;

        $days = $this->last_order_at ? $this->last_order_at->diffInDays(now()) : null;
        $recencyScore = match (true) {
            $days === null => 0,
            $days <= 30    => 15,
            $days <= 60    => 10,
            $days <= 90    => 5,
            default        => 0,
        };

        $this->trust_score = round(max(0, min(100, $completionRate + $paymentScore + $spendingScore + $recencyScore)), 2);
    }

    /** Promote if the order count and trust score (≥ 50) allow it. Returns the new tier, or null. */
    public function checkTierPromotion(StoreLoyaltySettings $settings): ?string
    {
        if ((float) $this->trust_score < 50) {
            return null;
        }

        $oldTier = $this->tier;

        if ($this->total_orders >= $settings->vip_threshold && $this->tier !== 'vip') {
            $this->tier = 'vip';
        } elseif ($this->total_orders >= $settings->loyal_threshold && in_array($this->tier, ['new', 'regular'])) {
            $this->tier = 'loyal';
        } elseif ($this->total_orders >= $settings->regular_threshold && $this->tier === 'new') {
            $this->tier = 'regular';
        }

        if ($this->tier !== $oldTier) {
            $this->tier_achieved_at = now();
            return $this->tier;
        }

        return null;
    }

    /**
     * Drop one tier if the trust score fell below 30 or the customer has been
     * inactive longer than the store's inactivity period. Returns the old tier, or null.
     *
     * Inactivity is measured from the later of the last order and the last tier
     * change, so an inactive customer drops one tier per inactivity period
     * (not one tier per day).
     */
    public function checkTierDemotion(StoreLoyaltySettings $settings): ?string
    {
        if ($this->tier === 'new') {
            return null;
        }

        $shouldDemote = (float) $this->trust_score < 30;

        if ($this->last_order_at) {
            $since = $this->tier_achieved_at && $this->tier_achieved_at->gt($this->last_order_at)
                ? $this->tier_achieved_at
                : $this->last_order_at;
            if ($since->diffInDays(now()) > $settings->inactivity_days) {
                $shouldDemote = true;
            }
        }

        if (! $shouldDemote) {
            return null;
        }

        $oldTier = $this->tier;
        $this->tier = ['vip' => 'loyal', 'loyal' => 'regular', 'regular' => 'new'][$this->tier] ?? 'new';
        $this->tier_achieved_at = now();

        return $oldTier;
    }

    public function getDownpaymentPercent(StoreLoyaltySettings $settings): int
    {
        return match ($this->tier) {
            'vip'     => $settings->vip_downpayment_percent,
            'loyal'   => $settings->loyal_downpayment_percent,
            'regular' => $settings->regular_downpayment_percent,
            default   => $settings->new_downpayment_percent,
        };
    }
}
