<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** J7: purchase order to a supplier — draft → sent → partially_received → received (or cancelled before receiving). */
class PurchaseOrder extends Model
{
    public const STATUS_LABELS = [
        'draft' => 'Draft', 'sent' => 'Sent', 'partially_received' => 'Partially received', 'received' => 'Received', 'cancelled' => 'Cancelled',
    ];

    /** Still expecting stock (counts as "already on order" for auto-reorder) */
    public const OPEN_STATUSES = ['sent', 'partially_received'];

    public const PAYMENT_LABELS = ['unpaid' => 'Unpaid', 'partial' => 'Partial', 'paid' => 'Paid'];

    protected $fillable = ['store_id', 'supplier_id', 'po_number', 'status', 'source', 'expected_on', 'sent_at', 'sent_by', 'received_at', 'notes', 'subtotal', 'created_by',
        // K6: supplier payment tracking
        'payment_status', 'amount_paid', 'payment_due_on', 'payment_reminders'];

    protected function casts(): array
    {
        return ['expected_on' => 'date', 'sent_at' => 'datetime', 'received_at' => 'datetime', 'subtotal' => 'decimal:2',
            'amount_paid' => 'decimal:2', 'payment_due_on' => 'date', 'payment_reminders' => 'array'];
    }

    public function payments(): HasMany
    {
        return $this->hasMany(PurchaseOrderPayment::class)->orderBy('paid_on')->orderBy('id');
    }

    /** K6: what we owe = the RECEIVED value (Σ quantity_received × unit_cost) — you pay for what arrived. */
    public function receivedValue(): float
    {
        $items = $this->relationLoaded('items') ? $this->items : $this->items()->get();

        return round((float) $items->sum(fn (PurchaseOrderItem $i) => (int) $i->quantity_received * (float) $i->unit_cost), 2);
    }

    public function balance(): float
    {
        return max(0.0, round($this->receivedValue() - (float) $this->amount_paid, 2));
    }

    public function isOverdue(): bool
    {
        return $this->payment_due_on !== null && $this->payment_status !== 'paid' && $this->payment_due_on->lt(now()->startOfDay()) && $this->balance() > 0;
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class)->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function anyReceived(): bool
    {
        return $this->items->sum('quantity_received') > 0;
    }

    public function recalcSubtotal(): void
    {
        $this->update(['subtotal' => round((float) $this->items()->sum('line_total'), 2)]);
    }
}
