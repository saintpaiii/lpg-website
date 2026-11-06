<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Acknowledgement receipt for ONE payment (see PaymentReceiptService). Never edited or reversed after it is issued —
 * refunds / credit memos are out of scope. No soft deletes: the number series must stay complete.
 */
class PaymentReceipt extends Model
{
    protected $fillable = [
        'receipt_number', 'store_id', 'order_id', 'customer_id', 'invoice_id', 'payment_id', 'amount', 'payment_method',
        'reference', 'source', 'kind', 'balance_after', 'received_at', 'emailed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount'        => 'decimal:2',
            'balance_after' => 'decimal:2',
            'received_at'   => 'datetime',
            'emailed_at'    => 'datetime',
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

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
