<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A rider's time-boxed membership in a customer↔store chat for one delivery.
 * Visible messages: from_message_id < id <= to_message_id (no upper bound while active).
 */
class ConversationRiderAccess extends Model
{
    protected $table = 'conversation_rider_access';

    protected $fillable = ['conversation_id', 'rider_id', 'delivery_id', 'from_message_id', 'to_message_id', 'ended_at'];

    protected $casts = ['ended_at' => 'datetime'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rider_id')->withTrashed();
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class);
    }

    public function isActive(): bool
    {
        return $this->ended_at === null;
    }
}
