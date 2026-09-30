<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CommissionInvoice extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id',
        'invoice_number',
        'period_start',
        'period_end',
        'total_orders',
        'total_sales',
        'commission_rate',
        'commission_amount',
        'status',
        'due_date',
        'paid_at',
        'payment_reference',
        'payment_method',
        'paymongo_checkout_id',
        'notes',
        'reminder_sent_at',
        'due_notice_sent_at',
        'overdue_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start'        => 'date',
            'period_end'          => 'date',
            'due_date'            => 'date',
            'paid_at'             => 'datetime',
            'reminder_sent_at'    => 'datetime',
            'due_notice_sent_at'  => 'datetime',
            'overdue_notified_at' => 'datetime',
            'total_orders'        => 'integer',
            'total_sales'         => 'decimal:2',
            'commission_rate'     => 'decimal:2',
            'commission_amount'   => 'decimal:2',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class)->withTrashed();
    }

    public function commissions(): HasMany
    {
        return $this->hasMany(Commission::class);
    }

    public function isUnpaid(): bool
    {
        return in_array($this->status, ['pending', 'overdue']);
    }

    public function periodLabel(): string
    {
        return $this->period_start->format('M d') . ' – ' . $this->period_end->format('M d, Y');
    }

    /** Days past the due date (0 when not yet due). */
    public function daysOverdue(): int
    {
        $today = now()->startOfDay();
        return $this->due_date->lt($today) ? (int) $this->due_date->diffInDays($today) : 0;
    }
}
