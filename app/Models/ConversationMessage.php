<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/** One chat message. sender_id NULL + sender_side 'system' = automatic order update. */
class ConversationMessage extends Model
{
    protected $fillable = ['conversation_id', 'sender_id', 'sender_side', 'is_automatic', 'auto_kind', 'body', 'attachment_path', 'order_id'];

    protected $casts = ['is_automatic' => 'boolean'];

    protected $appends = ['attachment_url'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id')->withTrashed();
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function getAttachmentUrlAttribute(): ?string
    {
        return $this->attachment_path ? Storage::disk('public')->url($this->attachment_path) : null;
    }
}
