<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'order_number',
        'customer_id',
        'transaction_type',
        'status',
        'total_amount',
        'shipping_fee',
        'platform_fee',
        'payment_method',
        'payment_status',
        'notes',
        'cancellation_reason',
        'cancellation_notes',
        'cancelled_by',
        'cancelled_at',
        'ordered_at',
        'delivered_at',
        'created_by',
        'payment_mode',
        'down_payment_amount',
        'remaining_balance',
        'delivery_latitude',
        'delivery_longitude',
        'delivery_distance_km',
        'estimated_delivery_minutes',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'shipping_fee' => 'decimal:2',
            'platform_fee' => 'decimal:2',
            'ordered_at'           => 'datetime',
            'delivered_at'         => 'datetime',
            'cancelled_at'         => 'datetime',
            'down_payment_amount'  => 'decimal:2',
            'remaining_balance'    => 'decimal:2',
            'delivery_latitude'           => 'decimal:7',
            'delivery_longitude'          => 'decimal:7',
            'delivery_distance_km'        => 'decimal:2',
            'estimated_delivery_minutes'  => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class);
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
