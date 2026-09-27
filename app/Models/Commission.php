<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    public const DEFAULT_RATE = 5.00;

    protected $fillable = [
        'order_id',
        'store_id',
        'order_total',
        'commission_rate',
        'commission_amount',
        'seller_amount',
        'status',
        'collected_at',
    ];

    protected function casts(): array
    {
        return [
            'order_total'       => 'decimal:2',
            'commission_rate'   => 'decimal:2',
            'commission_amount' => 'decimal:2',
            'seller_amount'     => 'decimal:2',
            'collected_at'      => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class)->withTrashed();
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class)->withTrashed();
    }
}
