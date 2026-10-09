<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/** One entry in a report's timeline. author NULL = system notice; is_internal = admin-only note. */
class ReportUpdate extends Model
{
    protected $fillable = ['user_report_id', 'author_id', 'author_side', 'body', 'attachments', 'is_internal', 'status_to'];

    protected $casts = [
        'attachments' => 'array',
        'is_internal' => 'boolean',
    ];

    protected $appends = ['attachment_urls'];

    public function report(): BelongsTo
    {
        return $this->belongsTo(UserReport::class, 'user_report_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id')->withTrashed();
    }

    public function getAttachmentUrlsAttribute(): array
    {
        return collect($this->attachments ?? [])->map(fn ($p) => Storage::url($p))->values()->all();
    }
}
