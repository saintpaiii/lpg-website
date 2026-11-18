<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $fillable = ['purchase_order_id', 'product_id', 'quantity_ordered', 'quantity_received', 'unit_cost', 'line_total', 'empties_sent'];

    protected function casts(): array
    {
        return ['quantity_ordered' => 'integer', 'quantity_received' => 'integer', 'unit_cost' => 'decimal:2', 'line_total' => 'decimal:2', 'empties_sent' => 'integer'];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function remaining(): int
    {
        return max(0, (int) $this->quantity_ordered - (int) $this->quantity_received);
    }
}
