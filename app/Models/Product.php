<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'name',
        'brand',
        'weight_kg',
        'weight',
        'selling_price',
        'cost_price',
        'refill_price',
        'purchase_price',
        'description',
        'image',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'weight_kg'      => 'decimal:2',
            'selling_price'  => 'decimal:2',
            'cost_price'     => 'decimal:2',
            'refill_price'   => 'decimal:2',
            'purchase_price' => 'decimal:2',
            'is_active'      => 'boolean',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function inventory(): HasOne
    {
        return $this->hasOne(Inventory::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function dssLogs(): HasMany
    {
        return $this->hasMany(DssLog::class);
    }

    public function ratings(): HasMany
    {
        return $this->hasMany(Rating::class);
    }
}
