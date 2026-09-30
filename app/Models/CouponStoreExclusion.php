<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A store that opted out of a platform coupon — the coupon won't discount its products. */
class CouponStoreExclusion extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['coupon_id', 'store_id', 'excluded_at'];

    protected function casts(): array
    {
        return ['excluded_at' => 'datetime'];
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
