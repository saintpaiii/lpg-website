<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/** One chat message. sender_id NULL + sender_side 'system' = automatic order update. */
class ConversationMessage extends Model
{
    protected $fillable = ['conversation_id', 'sender_id', 'sender_side', 'is_automatic', 'auto_kind', 'body', 'attachment_path', 'order_id',
        // J6: "📍 Share location"
        'latitude', 'longitude', 'location_label'];

    protected $casts = ['is_automatic' => 'boolean', 'latitude' => 'float', 'longitude' => 'float'];

    /** New photos (J6) are private: stored on the 'local' disk under this prefix and served by ChatAttachmentController. */
    public const PRIVATE_PREFIX = 'chat_private/';

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

    /**
     * Private photos → the authorized route (participants + admin); photos sent before J6 stay on the public disk
     * (chat_attachments/…) and keep their public URL.
     */
    public function getAttachmentUrlAttribute(): ?string
    {
        if (! $this->attachment_path) {
            return null;
        }

        return str_starts_with($this->attachment_path, self::PRIVATE_PREFIX)
            ? route('chat.attachment', ['message' => $this->id])
            : Storage::disk('public')->url($this->attachment_path);
    }

    public function hasLocation(): bool
    {
        return $this->latitude !== null && $this->longitude !== null;
    }

    /** List preview / notification text for a message without words. */
    public function previewText(): string
    {
        return $this->body ?: ($this->hasLocation() ? '📍 Shared a location' : ($this->attachment_path ? '📷 Photo' : ''));
    }
}
