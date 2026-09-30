<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Promo coupons. 'platform' coupons are created by the admin (the platform
 * absorbs the cost by waiving its commission); 'store' coupons are created by
 * a seller for their own store (commission is still charged on the original price).
 */
class Coupon extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'code',
        'type',
        'store_id',
        'scope',
        'discount_type',
        'discount_value',
        'min_order_amount',
        'max_discount_amount',
        'max_uses',
        'max_uses_per_user',
        'used_count',
        'starts_at',
        'expires_at',
        'is_active',
        'admin_share_percent',
        'seller_commission_during_promo',
        'featured_boost',
        'expiry_notified_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'discount_value'      => 'decimal:2',
            'min_order_amount'    => 'decimal:2',
            'max_discount_amount' => 'decimal:2',
            'max_uses'            => 'integer',
            'max_uses_per_user'   => 'integer',
            'used_count'          => 'integer',
            'starts_at'           => 'datetime',
            'expires_at'          => 'datetime',
            'expiry_notified_at'  => 'datetime',
            'is_active'           => 'boolean',
            'admin_share_percent' => 'integer',
            'seller_commission_during_promo' => 'decimal:2',
            'featured_boost'      => 'boolean',
        ];
    }

    public static function generateCode(string $prefix = 'LPG'): string
    {
        do {
            $code = $prefix . '-' . strtoupper(Str::random(4));
        } while (static::withTrashed()->where('code', $code)->exists());

        return $code;
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function uses(): HasMany
    {
        return $this->hasMany(CouponUse::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function exclusions(): HasMany
    {
        return $this->hasMany(CouponStoreExclusion::class);
    }

    /** @return int[] store ids that opted out of this (platform) coupon */
    public function excludedStoreIds(): array
    {
        return $this->type === 'platform'
            ? $this->exclusions()->pluck('store_id')->map(fn ($id) => (int) $id)->all()
            : [];
    }

    /** Active (or scheduled) platform coupons that have not expired. */
    public function scopeRunningPlatform(\Illuminate\Database\Eloquent\Builder $q, bool $includeScheduled = false): \Illuminate\Database\Eloquent\Builder
    {
        return $q->where('type', 'platform')
            ->where('is_active', true)
            ->where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->when(! $includeScheduled, fn ($w) => $w->where(fn ($s) => $s->whereNull('starts_at')->orWhere('starts_at', '<=', now())))
            ->where(fn ($w) => $w->whereNull('max_uses')->orWhereColumn('used_count', '<', 'max_uses'));
    }

    /** Human label, e.g. "10% off (max ₱100)" or "₱50 off delivery". */
    public function label(): string
    {
        $value = $this->discount_type === 'percentage'
            ? rtrim(rtrim(number_format((float) $this->discount_value, 2), '0'), '.') . '%'
            : '₱' . number_format((float) $this->discount_value, 2);

        $target = match ($this->scope) {
            'shipping' => ' off delivery',
            'both'     => ' off your order + delivery',
            default    => ' off',
        };

        $cap = $this->discount_type === 'percentage' && $this->max_discount_amount
            ? ' (max ₱' . number_format((float) $this->max_discount_amount, 2) . ')'
            : '';

        return $value . $target . $cap;
    }

    /** active | scheduled | expired | used_up | inactive */
    public function state(): string
    {
        if (! $this->is_active) return 'inactive';
        if ($this->expires_at && $this->expires_at->isPast()) return 'expired';
        if ($this->starts_at && $this->starts_at->isFuture()) return 'scheduled';
        if ($this->max_uses !== null && $this->used_count >= $this->max_uses) return 'used_up';
        return 'active';
    }
}
