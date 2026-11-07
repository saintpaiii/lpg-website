<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * A customer's star rating + optional review text and up to 3 photos (public disk, reviews/photos).
 * The author may edit within EDIT_DAYS of posting and delete at any time; the platform admin can remove photos
 * or delete the review (Admin → Reviews).
 *
 * Note: rows removed by a database cascade (user / product / order deleted) leave their photo files behind on disk.
 */
class Rating extends Model
{
    public const EDIT_DAYS  = 7;
    public const MAX_PHOTOS = 3;

    protected $fillable = [
        'user_id',
        'product_id',
        'store_id',
        'order_id',
        'rating',
        'review',
        'photo_paths',
        'edited_at',
        'photos_removed_by_admin',
    ];

    protected $appends = ['photo_urls'];

    protected function casts(): array
    {
        return [
            'rating'                  => 'integer',
            'photo_paths'             => 'array',
            'edited_at'               => 'datetime',
            'photos_removed_by_admin' => 'integer',
        ];
    }

    /** @return list<string> */
    public function getPhotoUrlsAttribute(): array
    {
        return array_values(array_map(
            fn (string $p) => Storage::disk('public')->url($p),
            $this->photo_paths ?? []
        ));
    }

    /** The author can still edit (within EDIT_DAYS of posting). */
    public function canEdit(): bool
    {
        return $this->created_at !== null && $this->created_at->copy()->addDays(self::EDIT_DAYS)->isFuture();
    }

    /** Delete every photo file of this review from the public disk. */
    public function deletePhotoFiles(): void
    {
        foreach ($this->photo_paths ?? [] as $path) {
            Storage::disk('public')->delete($path);
        }
    }

    /** Shared shape for every reviews list (product page, store page, seller reviews, admin). */
    public function publicPayload(): array
    {
        return [
            'id'         => $this->id,
            'rating'     => $this->rating,
            'review'     => $this->review,
            'photo_urls' => $this->photo_urls,
            'edited'     => $this->edited_at !== null,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
