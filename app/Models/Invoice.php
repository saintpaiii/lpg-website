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
        'payment_status',
        'paid_amount',
        'payment_method',
        'paid_at',
        'due_date',
        // Store-series invoice snapshot (null vat_status = issued before store invoices)
        'vat_status',
        'seller_name',
        'seller_tin',
        'seller_address',
        'buyer_tin',
        'grand_total',
        'vatable_sales',
        'vat_amount',
        'emailed_at',
        'paid_emailed_at',
    ];

    protected function casts(): array
    {
        return [
            'total_amount'        => 'decimal:2',
            'paid_amount'         => 'decimal:2',
            'paid_at'             => 'datetime',
            'due_date'            => 'date',
            'grand_total'         => 'decimal:2',
            'vatable_sales'       => 'decimal:2',
            'vat_amount'          => 'decimal:2',
            'emailed_at'          => 'datetime',
            'paid_emailed_at'     => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Invoice email (with PDF) — every payment path updates the invoice, so the model is the one place to hook
        static::created(fn (Invoice $i) => \App\Services\InvoiceService::onCreated($i));
        static::updated(fn (Invoice $i) => \App\Services\InvoiceService::onUpdated($i));
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

    /**
     * What the customer pays (items + delivery fee) — for DISPLAY in lists. grand_total is the snapshot taken when
     * the invoice was made; older invoices without it fall back to the item total + the order's delivery fee.
     * Load 'order' first in lists (N+1 otherwise). Stored values and revenue/report sums are not affected.
     */
    public function displayTotal(): float
    {
        if ($this->grand_total !== null) {
            return round((float) $this->grand_total, 2);
        }

        return round((float) $this->total_amount + (float) ($this->order?->shipping_fee ?? 0), 2);
    }

    /** SQL for the same number (sums / sorting), for queries on the invoices table joined to nothing. */
    public const DISPLAY_TOTAL_SQL = 'COALESCE(invoices.grand_total, invoices.total_amount + COALESCE((SELECT o.shipping_fee FROM orders o WHERE o.id = invoices.order_id), 0))';
}
