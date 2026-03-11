<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class DssLog extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'type',
        'product_id',
        'data',
        'accuracy',
    ];

    protected function casts(): array
    {
        return [
            'data'     => 'array',
            'accuracy' => 'decimal:2',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
