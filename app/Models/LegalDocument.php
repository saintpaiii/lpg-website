<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A version of a Terms / Policy document. published_at NULL = the (one) draft of its type.
 */
class LegalDocument extends Model
{
    public const TYPES = [
        'customer_terms' => 'Customer Terms of Service',
        'seller_terms'   => 'Seller Terms',
        'privacy_policy' => 'Privacy Policy',
    ];

    public const PUBLIC_PATHS = [
        'customer_terms' => '/terms',
        'seller_terms'   => '/seller-terms',
        'privacy_policy' => '/privacy',
    ];

    protected $fillable = [
        'type', 'version', 'title', 'body', 'change_summary', 'is_major',
        'published_at', 'published_by', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'version'      => 'integer',
            'is_major'     => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at');
    }

    public function scopeDraft(Builder $query): Builder
    {
        return $query->whereNull('published_at');
    }

    public function label(): string
    {
        return self::TYPES[$this->type] ?? $this->type;
    }

    public function publicPath(): string
    {
        return self::PUBLIC_PATHS[$this->type] ?? '/';
    }

    public function acceptances(): HasMany
    {
        return $this->hasMany(LegalAcceptance::class);
    }

    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }
}
