<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** J7: which batch an order line's cylinders came from (FIFO) — a cancel gives them back to the same batch. */
class OrderItemBatch extends Model
{
    protected $fillable = ['order_item_id', 'cylinder_batch_id', 'quantity'];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(CylinderBatch::class, 'cylinder_batch_id');
    }
}
