<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A store's delivery fee for one vehicle type: base fee + fee per km (see DeliveryFeeService). */
class StoreDeliveryRate extends Model
{
    protected $fillable = ['store_id', 'vehicle_type', 'base_fee', 'fee_per_km'];

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
