<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SellerWallet extends Model
{
    protected $fillable = [
        'store_id',
        'balance',
        'total_earned',
        'total_withdrawn',
        'total_commission',
    ];

    protected function casts(): array
    {
        return [
            'balance'          => 'decimal:2',
            'total_earned'     => 'decimal:2',
            'total_withdrawn'  => 'decimal:2',
            'total_commission' => 'decimal:2',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(WalletTransaction::class, 'store_id', 'store_id');
    }

    public function withdrawalRequests(): HasMany
    {
        return $this->hasMany(WithdrawalRequest::class, 'store_id', 'store_id');
    }
}
