<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CartItem extends Model
{
    protected $fillable = [
        'user_id',
        'product_id',
        'store_id',
        'quantity',
        'transaction_type',
    ];

    protected static function booted(): void
    {
        // J7: an accessory is always a new purchase — never a refill / tank exchange, never an empty tank
        static::saving(function (CartItem $ci) {
            if (Product::whereKey($ci->product_id)->value('product_type') === 'accessory') {
                $ci->transaction_type = 'new_purchase';
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
