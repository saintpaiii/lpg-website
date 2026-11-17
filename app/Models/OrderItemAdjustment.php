<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A refill tank NOT accepted at handover (rider delivery or store pick-up) — J4. See HandoverAdjustmentService. */
class OrderItemAdjustment extends Model
{
    protected $fillable = [
        'order_id', 'order_item_id', 'quantity', 'reason', 'note', 'photo_path', 'choice',
        'unit_price_before', 'unit_price_after', 'amount_change', 'stage', 'refund_request_id', 'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'quantity'          => 'integer',
            'unit_price_before' => 'decimal:2',
            'unit_price_after'  => 'decimal:2',
            'amount_change'     => 'decimal:2',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id')->withTrashed();
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by')->withTrashed();
    }
}
