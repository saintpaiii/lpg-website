<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/** One product photo or the product's short video (public disk). */
class ProductMedia extends Model
{
    protected $table = 'product_media';

    protected $fillable = ['product_id', 'type', 'path', 'poster_path', 'duration_seconds', 'width', 'height', 'sort_order'];

    protected function casts(): array
    {
        return [
            'duration_seconds' => 'integer',
            'width'            => 'integer',
            'height'           => 'integer',
            'sort_order'       => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function url(): string
    {
        return Storage::disk('public')->url($this->path);
    }

    public function posterUrl(): ?string
    {
        return $this->poster_path ? Storage::disk('public')->url($this->poster_path) : null;
    }
}
