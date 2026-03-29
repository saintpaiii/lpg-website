<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class SellerPayout extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id',
        'period_start',
        'period_end',
        'total_sales',
        'commission_rate',
        'commission_amount',
        'payout_amount',
        'status',
        'released_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'period_start'      => 'date',
            'period_end'        => 'date',
            'total_sales'       => 'decimal:2',
            'commission_rate'   => 'decimal:2',
            'commission_amount' => 'decimal:2',
            'payout_amount'     => 'decimal:2',
            'released_at'       => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
