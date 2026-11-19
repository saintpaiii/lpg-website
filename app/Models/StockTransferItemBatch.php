<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** J9: how many cylinders of one SOURCE batch a transfer line took (receiving copies its dates; cancel puts them back). */
class StockTransferItemBatch extends Model
{
    protected $fillable = ['stock_transfer_item_id', 'cylinder_batch_id', 'quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(CylinderBatch::class, 'cylinder_batch_id');
    }
}
