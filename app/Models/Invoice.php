<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'invoice_number',
        'order_id',
        'customer_id',
        'total_amount',
        'platform_commission',
        'payment_status',
        'paid_amount',
        'payment_method',
        'paid_at',
        'due_date',
    ];

    protected function casts(): array
    {
        return [
            'total_amount'        => 'decimal:2',
            'platform_commission' => 'decimal:2',
            'paid_amount'         => 'decimal:2',
            'paid_at'             => 'datetime',
            'due_date'            => 'date',
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

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
