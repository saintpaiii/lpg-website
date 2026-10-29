<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'name',
        'brand',
        'weight_kg',
        'weight',
        'selling_price',
        'cost_price',
        'refill_price',
        'purchase_price',
        'description',
        'image',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'weight_kg'      => 'decimal:2',
            'selling_price'  => 'decimal:2',
            'cost_price'     => 'decimal:2',
            'refill_price'   => 'decimal:2',
            'purchase_price' => 'decimal:2',
            'is_active'      => 'boolean',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Photos (max 8) and the short video, in display order. The first photo is the cover (cached in products.image). */
    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('sort_order')->orderBy('id');
    }

    /** Gallery data for the product page / seller form: [{id, type, url, poster_url, duration, width, height}] */
    public function mediaPayload(): array
    {
        return $this->media->map(fn (ProductMedia $m) => [
            'id'         => $m->id,
            'type'       => $m->type,
            'url'        => $m->url(),
            'poster_url' => $m->posterUrl(),
            'duration'   => $m->duration_seconds,
            'width'      => $m->width,
            'height'     => $m->height,
        ])->values()->all();
    }

    /** Card extras (Browse / store / similar): 2nd photo for hover, photo count, whether there is a video. */
    public function cardMedia(): array
    {
        $images = $this->media->where('type', 'image')->values();

        return [
            'hover_url'   => isset($images[1]) ? $images[1]->url() : null,
            'photo_count' => $images->count(),
            'has_video'   => $this->media->contains('type', 'video'),
        ];
    }

    /** Keep products.image (the cover every other page uses) in sync with the first photo. */
    public function syncCoverFromMedia(): void
    {
        $cover = $this->media()->where('type', 'image')->value('path');
        if ($this->image !== $cover) {
            $this->forceFill(['image' => $cover])->saveQuietly();
        }
    }

    public function inventory(): HasOne
    {
        return $this->hasOne(Inventory::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function dssLogs(): HasMany
    {
        return $this->hasMany(DssLog::class);
    }

    public function ratings(): HasMany
    {
        return $this->hasMany(Rating::class);
    }
}
