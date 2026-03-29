<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StorePayRate extends Model
{
    protected $fillable = ['store_id', 'sub_role', 'daily_rate'];

    protected function casts(): array
    {
        return ['daily_rate' => 'decimal:2'];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
