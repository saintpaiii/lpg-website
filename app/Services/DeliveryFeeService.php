<?php

namespace App\Services;

use App\Models\Store;

/**
 * Delivery fee rules used at checkout (and shown in advance by Find a Store).
 * Must stay identical to calcFee / haversineKm in resources/js/pages/customer/checkout.tsx.
 */
class DeliveryFeeService
{
    /** Straight-line distance in km between two points. */
    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        return DeliveryRouteService::haversineKm($lat1, $lng1, $lat2, $lng2);
    }

    /**
     * Distance-based fee: base + km × per-km, rounded up to the next ₱5.
     * A store without base/per-km settings charges its flat delivery_fee.
     */
    public static function fee(Store $store, float $distKm): float
    {
        $base  = (float) ($store->base_delivery_fee ?? 0);
        $perKm = (float) ($store->fee_per_km ?? 0);
        if ($base <= 0 && $perKm <= 0) {
            return (float) ($store->delivery_fee ?? 0);
        }
        return ceil(($base + $distKm * $perKm) / 5) * 5;
    }
}
