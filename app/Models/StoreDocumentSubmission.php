<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A renewed permit or an extra document a seller uploaded for admin review. */
class StoreDocumentSubmission extends Model
{
    protected $fillable = [
        'store_id', 'doc_type', 'label', 'file_path', 'expires_at', 'status', 'rejection_reason',
        'submitted_by', 'reviewed_by', 'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at'  => 'date',
            'reviewed_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
