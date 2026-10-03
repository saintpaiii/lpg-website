<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A rider's latest known position — one row per rider, upserted every ≤60s from the map view. */
class RiderCurrentLocation extends Model
{
    public const CREATED_AT = null;

    protected $fillable = ['user_id', 'latitude', 'longitude'];

    protected function casts(): array
    {
        return ['latitude' => 'float', 'longitude' => 'float', 'updated_at' => 'datetime'];
    }

    public static function record(int $userId, float $lat, float $lng): void
    {
        static::upsert(
            [['user_id' => $userId, 'latitude' => $lat, 'longitude' => $lng, 'updated_at' => now()]],
            ['user_id'],
            ['latitude', 'longitude', 'updated_at'],
        );
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
