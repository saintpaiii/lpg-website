<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CouponUse extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'coupon_id',
        'user_id',
        'order_id',
        'discount_applied',
        'admin_absorbed',
        'seller_absorbed',
        'commission_rate',
        'checkout_ref',
    ];

    protected function casts(): array
    {
        return [
            'discount_applied' => 'decimal:2',
            'admin_absorbed'   => 'decimal:2',
            'seller_absorbed'  => 'decimal:2',
            'commission_rate'  => 'decimal:2',
        ];
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
