<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A document a staff member / rider uploaded. The store owner reviews most documents; a rider's driver's license is
 * approved automatically when the live selfie matches it, otherwise the platform admin reviews it (the owner only monitors).
 */
class StaffDocument extends Model
{
    protected $fillable = [
        'user_id', 'store_id', 'doc_type', 'label', 'document_number', 'file_path', 'expires_at',
        'status', 'rejection_reason', 'reviewed_by', 'reviewed_at',
        // Driver's license: live selfie + Face++ result (J2) — auto_approved = approved without a person (reviewed_by null)
        'selfie_path', 'face_match_status', 'face_match_score', 'face_match_needed', 'face_match_message', 'auto_approved', 'face_checked_at',
    ];

    /** A pending license replaced by a newer upload: kept for history, not counted as a rejection (reviewed_by null). */
    public const REPLACED_REASON = 'Replaced by a newer upload.';

    protected static function booted(): void
    {
        // A license upload / approval / rejection can show or hide the store (eligible rider) — refresh the banner
        $forget = fn (StaffDocument $d) => Store::forgetVisibilityCache($d->store_id ?? User::whereKey($d->user_id)->value('store_id'));
        static::saved($forget);
        static::deleted($forget);
    }

    protected function casts(): array
    {
        return [
            'expires_at'  => 'date',
            'reviewed_at' => 'datetime',
            'auto_approved'   => 'boolean',
            'face_checked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
