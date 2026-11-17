<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\RiderCurrentLocation;
use App\Models\Store;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\VehicleCapacityMiss;
use Illuminate\Support\Collection;

/**
 * Vehicle decision support (J6):
 *  B1 best rider/vehicle for an order (rankRiders) + "wait for X" (waitHint)
 *  B2 split an order no vehicle can carry in one trip (splitTrips)
 *  B3 fleet advice on the seller DSS page (fleet → recommend)
 * The ranking / split / recommendation functions are PURE (arrays in, arrays out) so they are unit-testable;
 * the *Context / fleet() helpers gather the data with a few queries.
 * Every "does it fit" goes through DeliveryFeeService::fitsCapacity — the one rule.
 */
class VehicleDssService
{
    private static function kg(float $x): string
    {
        return rtrim(rtrim(number_format($x, 2, '.', ''), '0'), '.');
    }

    // ── B1: best rider / vehicle ─────────────────────────────────────────────

    /**
     * Rank riders for one order. Riders that can take it come first: smallest vehicle that fits (least spare kg after
     * loading) → fewer active stops → nearest (last GPS point vs the order pin) → name. The others stay listed with
     * their reason (disabled in the picker).
     *
     * @param  array{kg: float, tanks: int, by_size?: array}  $need
     * @param  array{0: float, 1: float}|null  $pin  order's [lat, lng]
     * @param  array<int, array{id: int, name: string, blocked?: ?string, vehicle?: ?array, on_board?: ?array, stops?: int, last_point?: ?array}>  $riders
     *         vehicle = DeliveryFeeService::capacity() shape; on_board = the rider's current load {kg, tanks, by_size}
     * @return array{ranked: array, recommended: ?array, text: ?string}
     */
    public static function rankRiders(array $need, ?array $pin, array $riders): array
    {
        $rows = [];
        foreach ($riders as $r) {
            $v       = $r['vehicle'] ?? null;
            $onBoard = $r['on_board'] ?? ['kg' => 0, 'tanks' => 0, 'by_size' => []];
            $reason  = $r['blocked'] ?? null;
            if ($reason === null && ! $v) {
                $reason = 'not clocked in with a vehicle';
            }
            if ($reason === null) {
                $reason = DeliveryFeeService::fitsCapacity($v, $need, $onBoard);
            }
            $loaded = (float) ($onBoard['kg'] ?? 0) + (float) $need['kg'];
            $dist   = $pin && ! empty($r['last_point'])
                ? round(DeliveryFeeService::distanceKm((float) $pin[0], (float) $pin[1], (float) $r['last_point'][0], (float) $r['last_point'][1]), 1)
                : null;
            $rows[] = [
                'id'          => $r['id'],
                'name'        => $r['name'],
                'ok'          => $reason === null,
                'reason'      => $reason,
                'vehicle'     => $v,
                'loaded_kg'   => round($loaded, 2),
                'spare_kg'    => $v ? round((float) $v['kg'] - $loaded, 2) : null,
                'stops'       => (int) ($r['stops'] ?? 0),
                'distance_km' => $dist,
            ];
        }

        usort($rows, fn ($a, $b) => [! $a['ok'], $a['ok'] ? $a['spare_kg'] : 0, $a['stops'], $a['distance_km'] ?? PHP_FLOAT_MAX, $a['name']]
            <=> [! $b['ok'], $b['ok'] ? $b['spare_kg'] : 0, $b['stops'], $b['distance_km'] ?? PHP_FLOAT_MAX, $b['name']]);

        $best = ($rows[0]['ok'] ?? false) ? $rows[0] : null;

        return ['ranked' => $rows, 'recommended' => $best, 'text' => $best ? static::reasonText($best) : null];
    }

    /** "Juan — Tricycle ABC-123: fits 75/150 kg, 1 stop, 2.1 km away" */
    public static function reasonText(array $row): string
    {
        $v = $row['vehicle'];
        $parts = ['fits ' . static::kg($row['loaded_kg']) . '/' . static::kg((float) $v['kg']) . ' kg',
            $row['stops'] . ' ' . ($row['stops'] === 1 ? 'stop' : 'stops')];
        if ($row['distance_km'] !== null) {
            $parts[] = $row['distance_km'] . ' km away';
        }

        return "{$row['name']} — {$v['label']}: " . implode(', ', $parts);
    }

    /**
     * Nobody free can take it, but a store vehicle could carry it in one trip (it is out with a rider, or nobody has
     * clocked in with it): say which one. Null when a free rider can take it or no vehicle could carry it at all.
     *
     * @param  array<int, array{cap: array, held_by?: ?string, stops?: int}>  $vehicles  every usable vehicle of the store
     */
    public static function waitHint(array $need, array $ranking, array $vehicles): ?string
    {
        if ($ranking['recommended'] !== null) {
            return null;
        }
        foreach ($vehicles as $v) {
            if (DeliveryFeeService::fitsCapacity($v['cap'], $need) !== null) {
                continue;
            }
            $label = $v['cap']['label'];
            if (! empty($v['held_by'])) {
                $stops = (int) ($v['stops'] ?? 0);

                return "{$label} can carry this order — it's out with {$v['held_by']}"
                    . ($stops ? " ({$stops} " . ($stops === 1 ? 'stop' : 'stops') . ')' : '') . ". Wait, or assign after {$v['held_by']} returns.";
            }

            return "{$label} can carry this order, but no rider is on shift with it. Assign after a rider clocks in with it.";
        }

        return null;
    }

    /** Riders of the picker → rankRiders() input, with 2 extra queries (last GPS points, active stop counts). */
    public static function riderContext(Collection $riderRows, array $loads, array $license): array
    {
        $ids    = $riderRows->pluck('id')->all();
        $points = RiderCurrentLocation::whereIn('user_id', $ids)->where('updated_at', '>=', now()->subHours(2))->get()->keyBy('user_id');
        $stops  = Delivery::whereIn('rider_id', $ids)->whereIn('status', Delivery::ACTIVE_STATUSES)
            ->selectRaw('rider_id, COUNT(*) as n')->groupBy('rider_id')->pluck('n', 'rider_id');
        $vehicles = Vehicle::whereIn('id', collect($loads)->pluck('vehicle.id')->filter()->all())->get()->keyBy('id');

        return $riderRows->map(function ($r) use ($loads, $license, $points, $stops, $vehicles) {
            $l = $loads[$r->id] ?? null;
            $v = ($vid = $l['vehicle']['id'] ?? null) ? $vehicles->get($vid) : null;
            $p = $points->get($r->id);

            return [
                'id'         => $r->id,
                'name'       => $r->first_name ?: $r->name,
                'blocked'    => ($license[$r->id]['can_deliver'] ?? true) ? null : ($license[$r->id]['license_note'] ?? 'license needed'),
                'vehicle'    => $v ? DeliveryFeeService::capacity($v) : null,
                'on_board'   => $l ? ['kg' => $l['load']['kg'] ?? 0, 'tanks' => $l['load']['tanks'] ?? 0, 'by_size' => $l['load']['by_size'] ?? []] : null,
                'stops'      => (int) ($stops[$r->id] ?? 0),
                'last_point' => $p ? [(float) $p->latitude, (float) $p->longitude] : null,
            ];
        })->values()->all();
    }

    /** Every usable vehicle of the store with who holds it now → waitHint() input. */
    public static function vehicleContext(Store $store): array
    {
        $holders = Attendance::with('user:id,name,first_name')->where('store_id', $store->id)
            ->whereNotNull('vehicle_id')->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])->get()->keyBy('vehicle_id');
        $stops = Delivery::whereIn('rider_id', $holders->pluck('user_id')->all())->whereIn('status', Delivery::ACTIVE_STATUSES)
            ->selectRaw('rider_id, COUNT(*) as n')->groupBy('rider_id')->pluck('n', 'rider_id');

        return DeliveryFeeService::usableVehicles($store)->sortBy(fn ($v) => (float) $v->max_capacity_kg)->map(fn (Vehicle $v) => [
            'cap'     => DeliveryFeeService::capacity($v),
            'held_by' => ($h = $holders->get($v->id)) ? ($h->user?->first_name ?: $h->user?->name) : null,
            'stops'   => ($h = $holders->get($v->id)) ? (int) ($stops[$h->user_id] ?? 0) : 0,
        ])->values()->all();
    }

    /**
     * B1 + B2 for one order, ready for the pages: the recommendation (rider id + text), the "wait for X" hint and,
     * when no store vehicle can carry it in one trip, the split suggestion.
     */
    public static function forOrder(Order $order, array $riderContext, array $vehicleContext): array
    {
        $order->loadMissing('items.product');
        $need = DeliveryFeeService::orderLoad($order->items);
        $pin  = $order->delivery_latitude && $order->delivery_longitude ? [(float) $order->delivery_latitude, (float) $order->delivery_longitude] : null;
        $rank = static::rankRiders($need, $pin, $riderContext);
        $caps = array_column($vehicleContext, 'cap');
        $oneTrip = collect($caps)->contains(fn ($c) => DeliveryFeeService::fitsCapacity($c, $need) === null);

        return [
            'recommended_rider_id' => $rank['recommended']['id'] ?? null,
            'recommended_text'     => $rank['text'],
            'wait_hint'            => static::waitHint($need, $rank, $vehicleContext),
            'split'                => $oneTrip || ! $caps ? null : static::splitTrips($need, $caps),
            'reasons'              => collect($rank['ranked'])->mapWithKeys(fn ($r) => [$r['id'] => $r['reason']])->all(),
        ];
    }

    /**
     * forOrder() for many orders at once (one rider / vehicle context for all) → [order_id => dss]. Only delivery
     * orders waiting for a rider (confirmed / preparing, no active delivery) get one.
     */
    public static function forOrders(Store $store, Collection $orders, Collection $riderRows, array $loads, array $license): array
    {
        $waiting = $orders->filter(fn (Order $o) => ! $o->isPickup() && in_array($o->status, ['confirmed', 'preparing'], true)
            && (! $o->delivery || $o->delivery->status === 'failed'));
        if ($waiting->isEmpty()) {
            return [];
        }
        $riders   = static::riderContext($riderRows, $loads, $license);
        $vehicles = static::vehicleContext($store);

        return $waiting->mapWithKeys(fn (Order $o) => [$o->id => static::forOrder($o, $riders, $vehicles)
            + ['split_message' => null]])->map(function ($d, $id) use ($waiting) {
                if ($d['split']) {
                    $d['split_message'] = static::splitMessage($waiting->firstWhere('id', $id), $d['split']);
                }

                return $d;
            })->all();
    }

    // ── B2: split into trips ─────────────────────────────────────────────────

    /**
     * An order no single vehicle can carry → a concrete split into trips, filled greedily by size (heaviest tanks first)
     * on the vehicle that carries the most of what is left; each trip is then put on the SMALLEST vehicle that carries it.
     * Null when some tank fits no vehicle at all.
     *
     * @param  array{by_size: array<string, int>}  $need
     * @param  array<int, array{kg: float, tanks: int, tank_limits?: ?array, label: string}>  $caps
     * @return array{trips: array<int, array{vehicle: string, items: array<string, int>, kg: float, text: string}>, text: string}|null
     */
    public static function splitTrips(array $need, array $caps): ?array
    {
        $left = array_filter(array_map('intval', $need['by_size'] ?? []));
        if (! $left || ! $caps) {
            return null;
        }
        $sizes = array_keys($left);
        usort($sizes, fn ($a, $b) => DeliveryFeeService::fullTankKg((float) $b) <=> DeliveryFeeService::fullTankKg((float) $a));
        $loadOf = function (array $items): array {
            $kg = 0.0;
            foreach ($items as $s => $q) {
                $kg += DeliveryFeeService::fullTankKg((float) $s) * $q;
            }

            return ['kg' => round($kg, 2), 'tanks' => array_sum($items), 'by_size' => $items];
        };

        $trips = [];
        for ($guard = 0; array_sum($left) > 0 && $guard < 20; $guard++) {
            $bestTrip = null;
            foreach ($caps as $cap) {
                $items = [];
                foreach ($sizes as $s) {
                    while (($items[$s] ?? 0) < ($left[$s] ?? 0)) {
                        $try = $items;
                        $try[$s] = ($try[$s] ?? 0) + 1;
                        if (DeliveryFeeService::fitsCapacity($cap, $loadOf($try)) !== null) {
                            break;
                        }
                        $items = $try;
                    }
                }
                $items = array_filter($items);
                $kg = $loadOf($items)['kg'];
                if ($items && ($bestTrip === null || $kg > $bestTrip['kg'])) {
                    $bestTrip = ['items' => $items, 'kg' => $kg];
                }
            }
            if ($bestTrip === null) {
                return null;   // a tank no vehicle can carry
            }
            // Smallest vehicle that carries this trip
            $fit = collect($caps)->filter(fn ($c) => DeliveryFeeService::fitsCapacity($c, $loadOf($bestTrip['items'])) === null)
                ->sortBy(fn ($c) => (float) $c['kg'])->first();
            foreach ($bestTrip['items'] as $s => $q) {
                $left[$s] -= $q;
            }
            $left = array_filter($left);
            $what = collect($bestTrip['items'])->map(fn ($q, $s) => "{$q} × {$s}kg")->implode(' + ');
            $trips[] = ['vehicle' => $fit['label'], 'items' => $bestTrip['items'], 'kg' => $bestTrip['kg'], 'text' => "{$what} on {$fit['label']}"];
        }
        if (array_sum($left) > 0) {
            return null;
        }

        return [
            'trips' => $trips,
            'text'  => collect($trips)->map(fn ($t, $i) => 'Trip ' . ($i + 1) . ': ' . $t['text'])->implode(' · '),
        ];
    }

    /** Prefilled chat text for "Message the customer" from the split panel. */
    public static function splitMessage(Order $order, array $split): string
    {
        return "Hi! Your order {$order->order_number} is more than our vehicles can carry in one trip. We can deliver it in "
            . count($split['trips']) . ' trips (' . collect($split['trips'])->map(fn ($t, $i) => 'trip ' . ($i + 1) . ': '
                . collect($t['items'])->map(fn ($q, $s) => "{$q} × {$s}kg")->implode(' + '))->implode('; ')
            . '), or you can pick it up at the store. Which do you prefer?';
    }

    // ── B3: fleet advice ─────────────────────────────────────────────────────

    /**
     * The numbers for the Fleet card (last N days) + the recommendation text. A few grouped queries; recommend() is pure.
     */
    public static function fleet(Store $store, ?int $days = null): array
    {
        $cfg   = config('delivery.dss');
        $days  = $days ?? (int) $cfg['days'];
        $since = now()->subDays($days);

        $misses = VehicleCapacityMiss::where('store_id', $store->id)->where('created_at', '>=', $since)->get();

        // Orders that waited for a vehicle: assigned > wait_hours after the store confirmed (= invoice issued)
        $deliveries = Delivery::with(['order.items.product', 'vehicle'])->where('store_id', $store->id)
            ->where('assigned_at', '>=', $since)->get();
        $confirmedAt = Invoice::whereIn('order_id', $deliveries->pluck('order_id'))->pluck('created_at', 'order_id');
        $waits = $deliveries->filter(fn ($d) => ($c = $confirmedAt[$d->order_id] ?? null) && $d->assigned_at
            && $d->assigned_at->diffInMinutes($c, true) > 60 * (float) $cfg['wait_hours'])
            ->map(fn ($d) => ['date' => $confirmedAt[$d->order_id]->timezone('Asia/Manila')->toDateString(), 'hour' => (int) $confirmedAt[$d->order_id]->timezone('Asia/Manila')->format('G')])
            ->values()->all();

        // Peak simultaneous active deliveries (sweep over [assigned, delivered/failed])
        $events = [];
        foreach ($deliveries as $d) {
            $start = $d->assigned_at;
            $end = $d->delivered_at ?? $d->failed_at ?? (in_array($d->status, Delivery::ACTIVE_STATUSES, true) ? now() : $d->updated_at);
            if ($start && $end && $end->gte($start)) {
                $events[] = [$start->getTimestamp(), 1];
                $events[] = [$end->getTimestamp(), -1];
            }
        }
        usort($events, fn ($a, $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
        $peak = $cur = 0;
        foreach ($events as [, $delta]) {
            $cur += $delta;
            $peak = max($peak, $cur);
        }

        $usable = DeliveryFeeService::usableVehicles($store);
        $biggest = $usable->sortByDesc(fn ($v) => (float) $v->max_capacity_kg)->first();

        // Per vehicle: trips (a batch = one trip), kg carried, average % of capacity per trip
        $perVehicle = Vehicle::where('store_id', $store->id)->where('status', '!=', 'retired')->get()->map(function (Vehicle $v) use ($deliveries, $cfg) {
            $mine  = $deliveries->where('vehicle_id', $v->id)->where('status', 'delivered');
            $trips = $mine->groupBy(fn ($d) => $d->batch_id ?: 'd' . $d->id);
            $kgs   = $trips->map(fn ($t) => DeliveryFeeService::orderLoad($t->flatMap(fn ($d) => $d->order?->items ?? []))['kg']);
            $pct   = $kgs->isEmpty() || (float) $v->max_capacity_kg <= 0 ? null : round($kgs->avg() / (float) $v->max_capacity_kg * 100);

            return [
                'id'        => $v->id,
                'label'     => DeliveryFeeService::label($v->vehicle_type) . ' ' . $v->plate_number,
                'type'      => $v->vehicle_type,
                'trips'     => $trips->count(),
                'kg'        => round((float) $kgs->sum(), 1),
                'pct_used'  => $pct,
                'underused' => $pct !== null && $pct < (float) $cfg['underused_pct'],
            ];
        })->values()->all();

        $stats = [
            'days'        => $days,
            'miss_kg'     => $misses->pluck('kg')->map(fn ($k) => (float) $k)->values()->all(),
            'miss_count'  => $misses->count(),
            'waits'       => $waits,
            'peak_active' => $peak,
            'vehicles'    => $usable->count(),
            'biggest'     => $biggest ? ['label' => DeliveryFeeService::label($biggest->vehicle_type), 'kg' => (float) $biggest->max_capacity_kg, 'type' => $biggest->vehicle_type] : null,
            'busiest_type' => collect($perVehicle)->sortByDesc('trips')->first()['type'] ?? $biggest?->vehicle_type,
        ];

        return $stats + ['per_vehicle' => $perVehicle, 'recommendations' => static::recommend($stats, $cfg)];
    }

    /**
     * Rule-based advice from the Fleet numbers (pure). Returns lines; "No change needed" when below every threshold.
     *
     * @return array<int, array{kind: string, text: string}>
     */
    public static function recommend(array $s, array $cfg): array
    {
        $out = [];

        // (a) orders over the biggest vehicle → the smallest vehicle type that covers most of them
        if (($s['miss_count'] ?? 0) >= (int) $cfg['misses_min']) {
            $kgs = $s['miss_kg'];
            sort($kgs);
            $idx  = max(0, (int) ceil(count($kgs) * (float) $cfg['miss_percentile'] / 100) - 1);
            $need = $kgs[$idx] ?? max($kgs);
            $have = (float) ($s['biggest']['kg'] ?? 0);
            $type = collect(DeliveryFeeService::types())->filter(fn ($t) => (float) $t['max_kg'] >= $need && (float) $t['max_kg'] > $have)
                ->sortBy('max_kg')->keys()->first();
            $biggest = $s['biggest'] ? "{$s['biggest']['label']} " . static::kg($have) . ' kg' : 'none';
            $out[] = ['kind' => 'bigger_vehicle', 'text' => "{$s['miss_count']} orders in {$s['days']} days were over your biggest vehicle ({$biggest}). "
                . 'Most needed ≤ ' . static::kg((float) $need) . ' kg'
                . ($type ? ' → consider adding a ' . DeliveryFeeService::label($type) . '.' : ' → consider splitting big orders into trips or offering pick-up.')];
        }

        // (b) orders waited for a vehicle on many days → one more of the busiest type, with the busy hours
        $waitDays = collect($s['waits'] ?? [])->pluck('date')->unique()->count();
        if ($waitDays >= (int) $cfg['wait_days_min']) {
            $hours = collect($s['waits'])->pluck('hour')->countBy()->sortDesc();
            $peak  = (int) $hours->keys()->first();
            $from  = \Illuminate\Support\Carbon::createFromTime($peak)->format('g');
            $to    = \Illuminate\Support\Carbon::createFromTime(($peak + 2) % 24)->format('g A');
            $type  = DeliveryFeeService::label($s['busiest_type'] ?? 'motorcycle');
            $out[] = ['kind' => 'more_vehicles', 'text' => "Vehicles were all busy on {$waitDays} days at {$from}–{$to} (orders waited over {$cfg['wait_hours']} h for a rider) → consider 1 more {$type}."];
        }

        // (c) peak simultaneous deliveries vs vehicles
        $vehicles = max(0, (int) ($s['vehicles'] ?? 0));
        if (($s['peak_active'] ?? 0) > $vehicles * (int) $cfg['stops_per_vehicle'] && ($s['peak_active'] ?? 0) > 0) {
            $out[] = ['kind' => 'peak', 'text' => "Up to {$s['peak_active']} deliveries were active at the same time with {$vehicles} usable "
                . ($vehicles === 1 ? 'vehicle' : 'vehicles') . " (about {$cfg['stops_per_vehicle']} stops per vehicle is comfortable) → consider another vehicle for peak hours."];
        }

        return $out ?: [['kind' => 'ok', 'text' => 'No change needed — your vehicles handled the last ' . ($s['days'] ?? 30) . ' days.']];
    }
}
