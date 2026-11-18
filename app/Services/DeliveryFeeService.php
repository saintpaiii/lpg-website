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
        $key = static::sizeKey($gas);
        $table = config('delivery.full_tank_kg', []);

        return isset($table[$key]) ? (float) $table[$key] : round($gas * 2, 1);
    }

    /**
     * The gas-size key used by full_tank_kg and vehicles.tank_limits (J6): "2.7", "11", "50" — never "2.70" / "11.0".
     * Null for products without a size. Mirrors sizeKey() in lib/delivery-fee.ts.
     */
    public static function sizeKey(?float $gasKg): ?string
    {
        $gas = round((float) $gasKg, 1);

        return $gas > 0 ? rtrim(rtrim(number_format($gas, 1, '.', ''), '0'), '.') : null;
    }

    /** "11kg" label for a size key. */
    public static function sizeLabel(string $key): string
    {
        return $key . 'kg';
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
     * @return array{kg: float, tanks: int, by_size: array<string, int>}  by_size: tanks per gas size (J6), e.g. ['11' => 3, '50' => 1]
     */
    public static function orderLoad(iterable $items): array
    {
        $kg = 0.0;
        $tanks = 0;
        $bySize = [];
        foreach ($items as $item) {
            $product = is_array($item) ? ($item['product'] ?? null) : $item->product;
            $qty     = (int) (is_array($item) ? ($item['quantity'] ?? 0) : $item->quantity);
            $w       = (float) ($product?->weight_kg ?? 0);
            $kg += static::itemKg($product) * $qty;
            // J7: accessories weigh something but are not "tanks" (no tank count / per-size limit used up by a hose)
            if ($w > 0 && ! static::isAccessory($product)) {
                $tanks += $qty;
                $key = static::sizeKey($w);
                $bySize[$key] = ($bySize[$key] ?? 0) + $qty;
            }
        }
        ksort($bySize, SORT_NUMERIC);

        return ['kg' => round($kg, 2), 'tanks' => $tanks, 'by_size' => $bySize];
    }

    /**
     * THE one check for "does this load fit this vehicle" (J6): total kg, total tanks AND the vehicle's per-size limits
     * (vehicles.tank_limits, e.g. {"11": 4, "50": 1}; a missing size / null = no per-size limit for it).
     * $onBoard: what the vehicle already carries on this trip (the rider's active deliveries) — added to $load first.
     * Returns null when it fits, else a human reason. Mirrors fits() in lib/delivery-fee.ts.
     *
     * @param  array{kg: float, tanks: int, by_size?: array<string, int>}  $load
     * @param  array{kg: float, tanks: int, by_size?: array<string, int>}|null  $onBoard
     */
    public static function fits(Vehicle $v, array $load, ?array $onBoard = null): ?string
    {
        return static::fitsCapacity(static::capacity($v), $load, $onBoard);
    }

    /** fits() on a plain capacity array {kg, tanks, tank_limits, label} — the DSS (pure functions) and tests use it. */
    public static function fitsCapacity(array $cap, array $load, ?array $onBoard = null): ?string
    {
        $kg = (float) ($load['kg'] ?? 0) + (float) ($onBoard['kg'] ?? 0);
        $tanks = (int) ($load['tanks'] ?? 0) + (int) ($onBoard['tanks'] ?? 0);
        $bySize = $load['by_size'] ?? [];
        foreach (($onBoard['by_size'] ?? []) as $size => $qty) {
            $bySize[$size] = ($bySize[$size] ?? 0) + (int) $qty;
        }
        $name = $cap['label'] ?? 'This vehicle';
        $num = fn (float $x) => rtrim(rtrim(number_format($x, 2, '.', ''), '0'), '.');

        if ($kg > (float) $cap['kg'] + 0.001) {
            return "{$name} carries up to {$num((float) $cap['kg'])} kg — this needs {$num($kg)} kg.";
        }
        if ($tanks > (int) $cap['tanks']) {
            return "{$name} carries up to {$cap['tanks']} tanks — this needs {$tanks}.";
        }
        foreach ((array) ($cap['tank_limits'] ?? []) as $size => $max) {
            if ($max === null || $max === '') {
                continue;
            }
            $need = (int) ($bySize[(string) $size] ?? 0);
            if ($need > (int) $max) {
                return "{$name} carries up to {$max} × {$size} kg tanks per trip — this needs {$need}.";
            }
        }

        return null;
    }

    /** "11kg ×4 · 22kg ×2 · 50kg ×1" for a vehicle's per-size limits (null when none). */
    public static function tankLimitsLabel(?array $limits): ?string
    {
        $parts = collect($limits ?? [])->filter(fn ($m) => $m !== null && $m !== '')
            ->sortKeys(SORT_NUMERIC)->map(fn ($m, $size) => "{$size}kg ×{$m}")->values();

        return $parts->isEmpty() ? null : $parts->implode(' · ');
    }

    /** Normalises a submitted per-size limit map: string keys like "11", int values, empty entries dropped (null when none). */
    public static function normaliseTankLimits(?array $limits): ?array
    {
        $out = [];
        foreach ($limits ?? [] as $size => $max) {
            $key = static::sizeKey((float) $size);
            if ($key !== null && $max !== null && $max !== '') {
                $out[$key] = (int) $max;
            }
        }
        ksort($out, SORT_NUMERIC);

        return $out ?: null;
    }

    /**
     * Weight ONE unit of this product adds to a delivery — the ONE place for it (orderLoad, checkout, the cart's
     * weight alert). Today: the full-tank weight of its gas size.
     */
    public static function itemKg($product): float
    {
        // J7: an accessory's own shipping weight (1 kg when not set); LPG → the full-tank weight of its gas size
        if (static::isAccessory($product)) {
            return round((float) ($product->unit_weight_kg ?? 0) ?: 1.0, 2);
        }

        return static::fullTankKg((float) ($product?->weight_kg ?? 0));
    }

    /** Works for a Product model or a plain array/object with product_type. */
    public static function isAccessory($product): bool
    {
        return ($product->product_type ?? null) === 'accessory';
    }

    /**
     * The store's biggest delivery-ready vehicle (usable + has a delivery fee): {kg, tanks}, or null when none.
     * The cart compares the order's weight with it (J4).
     */
    public static function biggestVehicle(Store $store): ?array
    {
        $rates = static::rates($store);
        $v = static::usableVehicles($store)->filter(fn (Vehicle $v) => $rates->has($v->vehicle_type))
            ->sortByDesc(fn (Vehicle $v) => [(float) $v->max_capacity_kg, (int) $v->max_tanks])->first();

        return $v ? ['kg' => (float) $v->max_capacity_kg, 'tanks' => (int) $v->max_tanks, 'tank_limits' => $v->tank_limits ?: null] : null;
    }

    /**
     * Every delivery-ready vehicle's capacity (kg, tanks, per-size limits) — the cart's alert runs fits() over them in TS (J6).
     *
     * @return array<int, array{kg: float, tanks: int, tank_limits: ?array, label: string}>
     */
    public static function capacities(Store $store): array
    {
        $rates = static::rates($store);

        return static::usableVehicles($store)->filter(fn (Vehicle $v) => $rates->has($v->vehicle_type))
            ->map(fn (Vehicle $v) => static::capacity($v))->values()->all();
    }

    /** One vehicle's capacity for the pages (same fields fits() reads). */
    public static function capacity(Vehicle $v): array
    {
        return ['kg' => (float) $v->max_capacity_kg, 'tanks' => (int) $v->max_tanks, 'tank_limits' => $v->tank_limits ?: null,
            'label' => static::label($v->vehicle_type) . ($v->plate_number ? ' ' . $v->plate_number : '')];
    }

    /** All the store's vehicles (not deleted, not retired) — uses the eager-loaded relation when present. */
    private static function vehicles(Store $store): Collection
    {
        $all = $store->relationLoaded('vehicles') ? $store->vehicles : $store->vehicles()->get();

        return $all->filter(fn (Vehicle $v) => $v->deleted_at === null && $v->status !== 'retired')->values();
    }

    /** Vehicles that can take a delivery now: available / in use, not paused by the plan (+ a fee → Store::deliveryReadyVehicles). */
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
    public static function quote(Store $store, ?float $distKm, float $kg, int $tanks, ?array $bySize = null): ?array
    {
        $load = ['kg' => $kg, 'tanks' => $tanks, 'by_size' => $bySize ?? []];
        $rates = static::rates($store);
        $order = array_flip(array_keys(static::types()));
        $best = null;
        foreach (static::usableVehicles($store) as $v) {
            $rate = $rates->get($v->vehicle_type);
            if (! $rate || static::fits($v, $load) !== null) {
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

    /**
     * Why quote() found nothing, as a code: no_vehicle | vehicles_unavailable | no_delivery_fee | too_heavy
     * (same branches as whyNoVehicle; Store::deliveryReadyVehicles is the "usable + priced" rule as a query).
     */
    public static function whyNoVehicleCode(Store $store, float $kg, int $tanks, ?array $bySize = null): string
    {
        if (static::vehicles($store)->isEmpty()) {
            return 'no_vehicle';
        }
        $usable = static::usableVehicles($store);
        if ($usable->isEmpty()) {
            return 'vehicles_unavailable';
        }
        $rates = static::rates($store);
        if ($usable->filter(fn (Vehicle $v) => $rates->has($v->vehicle_type))->isEmpty()) {
            return 'no_delivery_fee';
        }

        return 'too_heavy';
    }

    /** Why quote() found nothing — for checkout messages. */
    public static function whyNoVehicle(Store $store, float $kg, int $tanks, ?array $bySize = null): string
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
        // Within kg / tanks of a vehicle but over one of its per-size limits (J6): say which size
        if ($bySize) {
            foreach ($priced as $v) {
                $why = static::fits($v, ['kg' => $kg, 'tanks' => $tanks, 'by_size' => $bySize]);
                if ($why !== null && str_contains($why, ' kg tanks per trip')) {
                    return 'Too many tanks of one size for this store\'s vehicles: ' . $why;
                }
            }
        }

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
                'capacities'   => $vehicles->map(fn (Vehicle $v) => ['kg' => (float) $v->max_capacity_kg, 'tanks' => (int) $v->max_tanks, 'tank_limits' => $v->tank_limits ?: null])->values()->all(),
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
