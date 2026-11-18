<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Inventory extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'product_id',
        'quantity',          // FILLED (sellable) count — all old code keeps using it
        'empty_quantity',    // J7: empty cylinders in the store (collected on refills, sent back to suppliers)
        'damaged_quantity',  // J7: held aside, not sellable (waiting for return / disposal)
        'reorder_level',
    ];

    protected function casts(): array
    {
        return [
            'quantity'      => 'integer',
            'reorder_level' => 'integer',
            'empty_quantity' => 'integer',
            'damaged_quantity' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function isLowStock(): bool
    {
        return $this->quantity <= $this->reorder_level;
    }
}
