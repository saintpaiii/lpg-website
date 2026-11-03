<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Basic / Pro / Premium: price per 30 days and limits (null = unlimited). Features: config/plans.php. */
class SubscriptionPlan extends Model
{
    protected $fillable = ['key', 'name', 'price', 'max_products', 'max_staff', 'max_vehicles', 'sort_order'];

    protected function casts(): array
    {
        return [
            'price'        => 'decimal:2',
            'max_products' => 'integer',
            'max_staff'    => 'integer',
            'max_vehicles' => 'integer',
            'sort_order'   => 'integer',
        ];
    }
}
