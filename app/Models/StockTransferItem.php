<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** J9: one line of a stock transfer — source product → destination product, filled (default) or empty cylinders. */
class StockTransferItem extends Model
{
    protected $fillable = ['stock_transfer_id', 'from_product_id', 'to_product_id', 'empties', 'quantity', 'quantity_received', 'cylinder_incident_id'];

    protected function casts(): array
    {
        return ['empties' => 'boolean', 'quantity' => 'integer', 'quantity_received' => 'integer'];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(StockTransfer::class, 'stock_transfer_id');
    }

    public function fromProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'from_product_id')->withTrashed();
    }

    public function toProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'to_product_id')->withTrashed();
    }

    /** The source batches this line took (undated stock has no row). */
    public function batches(): HasMany
    {
        return $this->hasMany(StockTransferItemBatch::class);
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(CylinderIncident::class, 'cylinder_incident_id');
    }
}
