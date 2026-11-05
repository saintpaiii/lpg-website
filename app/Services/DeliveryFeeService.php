<?php

namespace App\Services;

use App\Models\Store;
use App\Models\Vehicle;
use Illuminate\Support\Collection;

/**
 * Delivery fee per vehicle type. For each delivery order the cheapest of the store's usable vehicles that can carry the
 * load (kg AND tanks on the SAME vehicle) is chosen automatically: fee = ceil((base + km × per_km) / 5) × 5, no distance
 * → the base fee. Ties: lowest fee → smallest fitting vehicle (max kg) → order of config('delivery.vehicle_types').
 *
 * Must stay identical to quoteFee() in resources/js/lib/delivery-fee.ts (checkout page) and haversineKm in
 * resources/js/lib/map.ts.
 */
class DeliveryFeeService
{
    /** Straight-line distance in km between two points. */
    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        return DeliveryRouteService::haversineKm($lat1, $lng1, $lat2, $lng2);
    }

    /** Vehicle type labels + suggested fees. */
    public static function types(): array
    {
        return config('delivery.vehicle_types', []);
    }

    public static function label(?string $type): string
    {
        return static::types()[$type]['label'] ?? ucwords(str_replace('_', ' ', (string) $type));
    }

    /** Weight of one FULL tank (gas + cylinder) for a gas size; products without a size weigh 0. Mirrors lib/delivery-fee.ts. */
    public static function fullTankKg(?float $gasKg): float
    {
        $gas = round((float) $gasKg, 1);
        if ($gas <= 0) {
            return 0.0;
        }
        // Key like "2.7" / "11" (never the raw "2.70" decimal attribute; PHP turns '5' into int 5 anyway)
        $key = rtrim(rtrim(number_format($gas, 1, '.', ''), '0'), '.');
        $table = config('delivery.full_tank_kg', []);

        return isset($table[$key]) ? (float) $table[$key] : round($gas * 2, 1);
    }

    /**
     * Legal maximum of a vehicle type (full tanks).
     *
     * @return array{kg: float, tanks: int}
     */
    public static function typeLimits(string $type): array
    {
        $t = static::types()[$type] ?? [];

        return ['kg' => (float) ($t['max_kg'] ?? 0), 'tanks' => (int) ($t['max_tanks'] ?? 0)];
    }

    /**
     * Total weight (FULL tanks) and number of tanks of a set of order lines.
     *
     * @param  iterable<array{product: mixed, quantity: int}|object>  $items  each with ->product / ['product'] and quantity
     * @return array{kg: float, tanks: int}
     */
    public static function orderLoad(iterable $items): array
    {
        $kg = 0.0;
        $tanks = 0;
        foreach ($items as $item) {
            $product = is_array($item) ? ($item['product'] ?? null) : $item->product;
            $qty     = (int) (is_array($item) ? ($item['quantity'] ?? 0) : $item->quantity);
            $w       = (float) ($product?->weight_kg ?? 0);
            $kg += static::fullTankKg($w) * $qty;
            if ($w > 0) {
                $tanks += $qty;
            }
        }

        return ['kg' => round($kg, 2), 'tanks' => $tanks];
    }

    /** All the store's vehicles (not deleted, not retired) — uses the eager-loaded relation when present. */
    private static function vehicles(Store $store): Collection
    {
        $all = $store->relationLoaded('vehicles') ? $store->vehicles : $store->vehicles()->get();

        return $all->filter(fn (Vehicle $v) => $v->deleted_at === null && $v->status !== 'retired')->values();
    }

    /** Vehicles that can take a delivery now: available / in use, not paused by the plan. */
    public static function usableVehicles(Store $store): Collection
    {
        return static::vehicles($store)
            ->filter(fn (Vehicle $v) => in_array($v->status, ['available', 'in_use'], true) && ! $v->paused_by_plan)
            ->values();
    }

    /** vehicle_type => rate */
    private static function rates(Store $store): Collection
    {
        $rates = $store->relationLoaded('deliveryRates') ? $store->deliveryRates : $store->deliveryRates()->get();

        return $rates->keyBy('vehicle_type');
    }

    private static function feeFor(float $base, float $perKm, ?float $distKm): float
    {
        return ceil(($base + ($distKm ?? 0) * $perKm) / 5) * 5;
    }

    /**
     * Cheapest vehicle type that can carry this load, or null when none fits / no usable vehicle has a fee.
     *
     * @return array{vehicle_type: string, label: string, fee: float, base_fee: float, fee_per_km: float}|null
     */
    public static function quote(Store $store, ?float $distKm, float $kg, int $tanks): ?array
    {
        $rates = static::rates($store);
        $order = array_flip(array_keys(static::types()));
        $best = null;
        foreach (static::usableVehicles($store) as $v) {
            $rate = $rates->get($v->vehicle_type);
            if (! $rate || (float) $v->max_capacity_kg < $kg || (int) $v->max_tanks < $tanks) {
                continue;
            }
            $fee = static::feeFor((float) $rate->base_fee, (float) $rate->fee_per_km, $distKm);
            $key = [$fee, (float) $v->max_capacity_kg, $order[$v->vehicle_type] ?? 99];
            if ($best === null || $key < $best['key']) {
                $best = ['key' => $key, 'vehicle' => $v, 'rate' => $rate, 'fee' => $fee];
            }
        }
        if ($best === null) {
            return null;
        }

        return [
            'vehicle_type' => $best['vehicle']->vehicle_type,
            'label'        => static::label($best['vehicle']->vehicle_type),
            'fee'          => (float) $best['fee'],
            'base_fee'     => (float) $best['rate']->base_fee,
            'fee_per_km'   => (float) $best['rate']->fee_per_km,
        ];
    }

    /** Why quote() found nothing — for checkout messages. */
    public static function whyNoVehicle(Store $store, float $kg, int $tanks): string
    {
        if (static::vehicles($store)->isEmpty()) {
            return 'This store has no delivery vehicle yet.';
        }
        $usable = static::usableVehicles($store);
        if ($usable->isEmpty()) {
            return "This store's vehicles are not available right now.";
        }
        $rates  = static::rates($store);
        $priced = $usable->filter(fn (Vehicle $v) => $rates->has($v->vehicle_type));
        if ($priced->isEmpty()) {
            return "This store hasn't set delivery fees yet.";
        }
        $largest = $priced->sortByDesc(fn (Vehicle $v) => [(float) $v->max_capacity_kg, (int) $v->max_tanks])->first();

        return 'Too heavy for this store\'s vehicles (max ' . rtrim(rtrim(number_format((float) $largest->max_capacity_kg, 2, '.', ''), '0'), '.')
            . " kg / {$largest->max_tanks} tanks per trip).";
    }

    /**
     * For the checkout page: one entry per vehicle type that has a fee and a usable vehicle, with each vehicle's
     * capacity (kg and tanks of the SAME vehicle). quoteFee() in lib/delivery-fee.ts applies the same rule as quote().
     *
     * @return array<int, array{vehicle_type: string, label: string, base_fee: float, fee_per_km: float, capacities: array<int, array{kg: float, tanks: int}>}>
     */
    public static function clientOptions(Store $store): array
    {
        $rates = static::rates($store);
        $out = [];
        foreach (static::usableVehicles($store)->groupBy('vehicle_type') as $type => $vehicles) {
            if (! $rate = $rates->get($type)) {
                continue;
            }
            $out[] = [
                'vehicle_type' => $type,
                'label'        => static::label($type),
                'base_fee'     => (float) $rate->base_fee,
                'fee_per_km'   => (float) $rate->fee_per_km,
                'capacities'   => $vehicles->map(fn (Vehicle $v) => ['kg' => (float) $v->max_capacity_kg, 'tanks' => (int) $v->max_tanks])->values()->all(),
            ];
        }
        $order = array_flip(array_keys(static::types()));
        usort($out, fn ($a, $b) => ($order[$a['vehicle_type']] ?? 99) <=> ($order[$b['vehicle_type']] ?? 99));

        return $out;
    }

    /** Cheapest base fee ("Delivery from ₱40"), null when the store can't deliver. */
    public static function fromFee(Store $store): ?float
    {
        $options = static::clientOptions($store);

        return $options ? (float) min(array_column($options, 'base_fee')) : null;
    }
}
