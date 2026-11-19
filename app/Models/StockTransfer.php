<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** J9: stock sent from one of an owner's stores to another ("TR-000001" per owner). sent → received | cancelled. */
class StockTransfer extends Model
{
    public const STATUS_LABELS = ['sent' => 'On the way', 'received' => 'Received', 'cancelled' => 'Cancelled'];

    protected $fillable = ['owner_id', 'from_store_id', 'to_store_id', 'transfer_number', 'status', 'notes',
        'sent_by', 'sent_at', 'received_by', 'received_at', 'cancelled_by', 'cancelled_at'];

    protected function casts(): array
    {
        return ['sent_at' => 'datetime', 'received_at' => 'datetime', 'cancelled_at' => 'datetime'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockTransferItem::class);
    }

    public function fromStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'from_store_id')->withTrashed();
    }

    public function toStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'to_store_id')->withTrashed();
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
