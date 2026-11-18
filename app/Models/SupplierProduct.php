<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** J7: what a supplier sells to the store, at what cost; one preferred supplier per product (enforced in code). */
class SupplierProduct extends Model
{
    protected $fillable = ['supplier_id', 'product_id', 'unit_cost', 'min_order_qty', 'is_preferred'];

    protected function casts(): array
    {
        return ['unit_cost' => 'decimal:2', 'min_order_qty' => 'integer', 'is_preferred' => 'boolean'];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
