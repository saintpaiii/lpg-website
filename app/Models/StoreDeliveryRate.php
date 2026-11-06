<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A store's delivery fee for one vehicle type: base fee + fee per km (see DeliveryFeeService). */
class StoreDeliveryRate extends Model
{
    protected $fillable = ['store_id', 'vehicle_type', 'base_fee', 'fee_per_km'];

    protected static function booted(): void
    {
        // A vehicle type without a fee can't deliver → store visibility changes (banner cache)
        $forget = fn (StoreDeliveryRate $r) => Store::forgetVisibilityCache($r->store_id);
        static::saved($forget);
        static::deleted($forget);
    }

    protected function casts(): array
    {
        return [
            'base_fee'   => 'decimal:2',
            'fee_per_km' => 'decimal:2',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
