<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A chat thread. Create through App\Services\ChatService, never directly.
 * customer_id / rider_id are user IDs.
 */
class Conversation extends Model
{
    public const CUSTOMER_STORE = 'customer_store';
    public const STORE_RIDER    = 'store_rider';
    public const CUSTOMER_RIDER = 'customer_rider';

    protected $fillable = [
        'type', 'store_id', 'customer_id', 'rider_id', 'delivery_id',
        'last_message_at', 'last_message_preview', 'closed_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'closed_at'       => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'customer_id')->withTrashed();
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rider_id')->withTrashed();
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ConversationMessage::class);
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(ConversationMessage::class)->latestOfMany();
    }

    /** Riders who joined this customer↔store chat for a delivery. */
    public function riderAccess(): HasMany
    {
        return $this->hasMany(ConversationRiderAccess::class);
    }

    public function activeRiderAccess(): HasMany
    {
        return $this->hasMany(ConversationRiderAccess::class)->whereNull('ended_at');
    }

    public function isClosed(): bool
    {
        return $this->closed_at !== null;
    }
}
