<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One plan period of a store: a PayMongo or cash purchase, the free trial, or free days given by the admin.
 * status: pending | paid | cancelled · method: paymongo | cash | trial | gift
 */
class SubscriptionPayment extends Model
{
    protected $fillable = [
        'store_id', 'plan_key', 'amount', 'status', 'method', 'paymongo_checkout_id', 'reference', 'receipt_number',
        'period_start', 'period_end', 'days', 'paid_at', 'created_by', 'recorded_by', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount'       => 'decimal:2',
            'period_start' => 'datetime',
            'period_end'   => 'datetime',
            'paid_at'      => 'datetime',
            'days'         => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class)->withTrashed();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function scopePaid(Builder $q): Builder
    {
        return $q->where('status', 'paid');
    }
}
