<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class RefundRequest extends Model
{
    use SoftDeletes;

    public const REASONS = [
        'damaged_product',
        'leaking_tank',
        'wrong_product',
        'missing_items',
        'quality_issue',
        'other',
    ];

    public const RESOLUTIONS = ['replacement', 'money_refund', 'store_discount'];

    public const RETURN_METHODS = ['rider_pickup', 'customer_dropoff', 'no_return'];

    protected $fillable = [
        'order_id',
        'customer_id',
        'store_id',
        'amount',
        'reason',
        'preferred_resolution',
        'description',
        'evidence_paths',
        'status',
        'seller_resolution',
        'seller_notes',
        'refund_reference',
        'replacement_order_id',
        'replacement_delivery_id',
        'return_method',
        'seller_responded_at',
        'escalated_to_admin',
        'escalation_reason',
        'escalated_at',
        'admin_decision',
        'admin_decided_at',
        'admin_notes',
        'processed_at',
    ];

    protected $casts = [
        'evidence_paths'      => 'array',
        'processed_at'        => 'datetime',
        'seller_responded_at' => 'datetime',
        'escalated_at'        => 'datetime',
        'admin_decided_at'    => 'datetime',
        'escalated_to_admin'  => 'boolean',
        'amount'              => 'decimal:2',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function replacementOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'replacement_order_id');
    }

    public function replacementDelivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class, 'replacement_delivery_id');
    }

    public function coupon(): HasOne
    {
        return $this->hasOne(StoreCoupon::class);
    }

    /** Customer may escalate once, after the seller has responded. */
    public function canEscalate(): bool
    {
        return ! $this->escalated_to_admin
            && in_array($this->status, ['rejected', 'approved', 'processed'])
            && $this->seller_responded_at !== null;
    }
}
