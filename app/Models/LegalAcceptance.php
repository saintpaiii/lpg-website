<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Proof that a user agreed to a specific version of a Terms / Policy document. */
class LegalAcceptance extends Model
{
    public const CONTEXT_LABELS = [
        'registration'       => 'At registration',
        'seller_application' => 'Seller application',
        'update_popup'       => 'Accepted update',
    ];

    protected $fillable = ['user_id', 'legal_document_id', 'accepted_at', 'ip_address', 'user_agent', 'context'];

    protected function casts(): array
    {
        return ['accepted_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(LegalDocument::class, 'legal_document_id');
    }
}
