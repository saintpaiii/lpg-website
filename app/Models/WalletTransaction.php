<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class WalletTransaction extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id',
        'order_id',
        'type',
        'amount',
        'commission',
        'running_balance',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'amount'          => 'decimal:2',
            'commission'      => 'decimal:2',
            'running_balance' => 'decimal:2',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
