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

    protected $fillable = ['store_id', 'supplier_id', 'po_number', 'status', 'source', 'expected_on', 'sent_at', 'sent_by', 'received_at', 'notes', 'subtotal', 'created_by'];

    protected function casts(): array
    {
        return ['expected_on' => 'date', 'sent_at' => 'datetime', 'received_at' => 'datetime', 'subtotal' => 'decimal:2'];
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
