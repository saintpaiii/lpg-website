<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class DeliveryProof extends Model
{
    protected $fillable = [
        'delivery_id',
        'user_id',
        'status',
        'photo_path',
        'notes',
        'location_note',
    ];

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * J6: proofs are private — new ones are on the 'local' disk and open through the authorized documents route
     * (the order's customer, the store, the rider, admin). Proofs saved before J6 that are still on the public disk keep
     * their public URL until `php artisan proofs:move-private --force` moves them.
     */
    public function getPhotoUrlAttribute(): ?string
    {
        if (! $this->photo_path) {
            return null;
        }

        return Storage::disk('public')->exists($this->photo_path) && ! Storage::disk('local')->exists($this->photo_path)
            ? Storage::disk('public')->url($this->photo_path)
            : \App\Support\PrivateDocument::url('delivery-proof', $this->id, 'photo_path');
    }
}
