<?php

namespace App\Models;

use App\Services\DeliveryFeeService;
use Illuminate\Database\Eloquent\Model;

/** An order no vehicle of the store could carry in one trip (refused at checkout / switched to pick-up) — J6 Fleet DSS. */
class VehicleCapacityMiss extends Model
{
    public const UPDATED_AT = null;

    /** At most one row per customer + store in this window (page load, retries and the POST count once). */
    public const DEDUPE_MINUTES = 10;

    protected $fillable = ['store_id', 'user_id', 'kg', 'tanks', 'by_size', 'reason'];

    protected function casts(): array
    {
        return ['kg' => 'decimal:2', 'tanks' => 'integer', 'by_size' => 'array', 'created_at' => 'datetime'];
    }

    /**
     * Why no vehicle of the store can carry this load: 'too_heavy' | 'too_many_of_size', or null when one can (or the
     * store can't deliver for another reason — no vehicle / no fee / unavailable, which is not a capacity problem).
     *
     * @param  array{kg: float, tanks: int, by_size?: array}  $load
     */
    public static function reasonFor(Store $store, array $load): ?string
    {
        if (DeliveryFeeService::quote($store, null, $load['kg'], $load['tanks'], $load['by_size'] ?? [])) {
            return null;
        }
        if (DeliveryFeeService::whyNoVehicleCode($store, $load['kg'], $load['tanks'], $load['by_size'] ?? []) !== 'too_heavy') {
            return null;
        }

        return str_starts_with(DeliveryFeeService::whyNoVehicle($store, $load['kg'], $load['tanks'], $load['by_size'] ?? []), 'Too many tanks of one size')
            ? 'too_many_of_size' : 'too_heavy';
    }

    /**
     * Log one miss with the dedupe: a row for this customer + store in the last 10 minutes is reused — so loading the
     * checkout page and then posting it count ONCE. 'switched_to_pickup' (they then ordered for pick-up) updates that row.
     */
    public static function record(int $storeId, ?int $userId, array $load, string $reason): self
    {
        $recent = static::where('store_id', $storeId)->where('user_id', $userId)
            ->where('created_at', '>=', now()->subMinutes(self::DEDUPE_MINUTES))->latest('id')->first();
        if ($recent) {
            if ($reason === 'switched_to_pickup' && $recent->reason !== $reason) {
                $recent->update(['reason' => $reason]);
            }

            return $recent;
        }

        return static::create(['store_id' => $storeId, 'user_id' => $userId, 'kg' => $load['kg'], 'tanks' => $load['tanks'],
            'by_size' => $load['by_size'] ?? [], 'reason' => $reason]);
    }
}
