<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * J7: a batch of filled cylinders that came in together, with the requalification (expiry) date stamped on the collar.
 * Orders take stock from the oldest NON-expired batch first (FIFO, StockService).
 */
class CylinderBatch extends Model
{
    protected $fillable = ['store_id', 'product_id', 'purchase_order_item_id', 'supplier_id', 'batch_code', 'source', 'quantity_received',
        'quantity_remaining', 'manufactured_on', 'requalification_due_on', 'received_on', 'expiry_notices', 'notes'];

    protected function casts(): array
    {
        return ['manufactured_on' => 'date', 'requalification_due_on' => 'date', 'received_on' => 'date', 'expiry_notices' => 'array',
            'quantity_received' => 'integer', 'quantity_remaining' => 'integer'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function isExpired(): bool
    {
        return $this->requalification_due_on !== null && $this->requalification_due_on->lt(now()->startOfDay());
    }

    /** Days until the requalification date (negative = expired), null when unknown. */
    public function daysLeft(): ?int
    {
        return $this->requalification_due_on ? (int) now()->startOfDay()->diffInDays($this->requalification_due_on->copy()->startOfDay(), false) : null;
    }

    /** "B-261118-3": the store's n-th batch received that day. */
    public static function nextCode(int $storeId): string
    {
        $prefix = 'B-' . now()->format('ymd') . '-';
        $n = static::where('store_id', $storeId)->where('batch_code', 'like', $prefix . '%')->count() + 1;

        return $prefix . $n;
    }
}
