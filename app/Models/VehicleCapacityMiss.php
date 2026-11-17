<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An order no vehicle of the store could carry in one trip (refused at checkout / switched to pick-up) — J6 Fleet DSS. */
class VehicleCapacityMiss extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['store_id', 'user_id', 'kg', 'tanks', 'by_size', 'reason'];

    protected function casts(): array
    {
        return ['kg' => 'decimal:2', 'tanks' => 'integer', 'by_size' => 'array', 'created_at' => 'datetime'];
    }
}
