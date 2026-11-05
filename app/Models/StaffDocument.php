<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A document a staff member / rider uploaded for the store owner to review (e.g. a driver's license). */
class StaffDocument extends Model
{
    protected $fillable = [
        'user_id', 'store_id', 'doc_type', 'label', 'document_number', 'file_path', 'expires_at',
        'status', 'rejection_reason', 'reviewed_by', 'reviewed_at',
    ];

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
