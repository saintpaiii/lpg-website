<?php

namespace App\Services;

use App\Models\BarangayCoordinate;
use App\Models\Order;
use App\Models\Store;

/** Coordinates for stores/orders and nearest-neighbour stop ordering for batch deliveries. */
class DeliveryRouteService
{
    public static function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r    = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Store pickup point: its pinned location, else its barangay centre.
     *
     * @return array{lat: float, lng: float, approximate: bool}|null
     */
    public static function storeLocation(?Store $store): ?array
    {
        if (! $store) {
            return null;
        }
        if ($store->latitude && $store->longitude) {
            return ['lat' => (float) $store->latitude, 'lng' => (float) $store->longitude, 'approximate' => false];
        }
        $geo = BarangayCoordinate::lookup($store->city, $store->barangay);

        return $geo ? ['lat' => $geo[0], 'lng' => $geo[1], 'approximate' => true] : null;
    }

    /** Fill an order's delivery coordinates from its delivery city + barangay (or the customer's). Returns true if set. */
    public static function geocodeOrder(Order $order): bool
    {
        if ($order->delivery_latitude && $order->delivery_longitude) {
            return false;
        }
        $order->loadMissing('customer');
        $addr = $order->deliveryAddressParts();
        $geo  = BarangayCoordinate::lookup($addr['city'], $addr['barangay']);
        if (! $geo) {
            return false;
        }
        $order->forceFill(['delivery_latitude' => $geo[0], 'delivery_longitude' => $geo[1]])->saveQuietly();

        return true;
    }

    /**
     * Nearest-neighbour ordering starting from the store: always drive to the closest
     * remaining stop next. Not globally optimal, but good for the small batches a rider carries.
     *
     * @param  iterable<Order>  $orders  (must have delivery coordinates)
     * @return Order[]
     */
    public static function optimizeRoute(float $startLat, float $startLng, iterable $orders): array
    {
        $remaining = is_array($orders) ? array_values($orders) : collect($orders)->values()->all();
        $ordered   = [];
        [$lat, $lng] = [$startLat, $startLng];

        while ($remaining) {
            $nearestIndex = 0;
            $nearest      = PHP_FLOAT_MAX;
            foreach ($remaining as $i => $order) {
                $d = static::haversineKm($lat, $lng, (float) $order->delivery_latitude, (float) $order->delivery_longitude);
                if ($d < $nearest) {
                    $nearest      = $d;
                    $nearestIndex = $i;
                }
            }
            $next      = $remaining[$nearestIndex];
            $ordered[] = $next;
            [$lat, $lng] = [(float) $next->delivery_latitude, (float) $next->delivery_longitude];
            array_splice($remaining, $nearestIndex, 1);
        }

        return $ordered;
    }
}
