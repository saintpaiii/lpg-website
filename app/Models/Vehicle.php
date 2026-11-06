<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Vehicle extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'vehicle_type',
        'plate_number',
        'max_capacity_kg',
        'max_tanks',
        'description',
        'status',
        'assigned_rider_id',
        'paused_by_plan',
    ];

    protected static function booted(): void
    {
        // Customers see a store only with a delivery-ready vehicle → refresh the owner's "hidden" banner at once
        $forget = fn (Vehicle $v) => Store::forgetVisibilityCache($v->store_id);
        static::saved($forget);
        static::deleted($forget);
        static::restored($forget);
    }

    protected function casts(): array
    {
        return [
            'max_capacity_kg' => 'decimal:2',
            'max_tanks'       => 'integer',
            'paused_by_plan'  => 'boolean',
        ];
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function assignedRider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_rider_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class);
    }
}
