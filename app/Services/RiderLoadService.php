<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\Store;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Support\Collection;

/**
 * A rider's vehicle for the shift (chosen at clock-in, held until clock-out) and its load: every assignment must keep
 * the TOTAL of the rider's active deliveries within the vehicle's max kg AND max tanks (RA 11592 Sec. 38(d)(11)).
 * Loads use full-tank weight (DeliveryFeeService::orderLoad).
 */
class RiderLoadService
{
    /**
     * The rider's open shift: clocked in, not out, dated today or yesterday (a shift may pass midnight). An open row
     * older than yesterday is a forgotten clock-out and holds no vehicle.
     */
    public static function openAttendance(User $rider): ?Attendance
    {
        return Attendance::where('user_id', $rider->id)
            ->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])
            ->orderByDesc('date')->first();
    }

    public static function currentVehicle(User $rider): ?Vehicle
    {
        return static::openAttendance($rider)?->vehicle;
    }

    /** Vehicle ids held by open shifts of the store's riders (optionally ignoring one rider). */
    public static function heldVehicleIds(int $storeId, ?int $exceptUserId = null): array
    {
        return Attendance::where('store_id', $storeId)
            ->whereNotNull('vehicle_id')->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])
            ->when($exceptUserId, fn ($q) => $q->where('user_id', '!=', $exceptUserId))
            ->pluck('vehicle_id')->all();
    }

    /** Usable vehicles nobody else holds right now (for the clock-in picker). */
    public static function freeVehicles(Store $store, ?int $forUserId = null): Collection
    {
        $held = static::heldVehicleIds($store->id, $forUserId);

        return DeliveryFeeService::usableVehicles($store)->reject(fn (Vehicle $v) => in_array($v->id, $held))->values();
    }

    /**
     * Clock-in picker rows: every usable vehicle, with who is using it (taken ones are shown disabled).
     *
     * @return array<int, array{id: int, vehicle_type: string, label: string, plate_number: string, max_tanks: int, max_kg: float, in_use_by: ?string, assigned_to_me: bool}>
     */
    public static function pickerVehicles(Store $store, User $rider): array
    {
        $holders = Attendance::with('user:id,name,first_name')->where('store_id', $store->id)
            ->whereNotNull('vehicle_id')->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])
            ->where('user_id', '!=', $rider->id)->get()->keyBy('vehicle_id');

        return DeliveryFeeService::usableVehicles($store)->map(fn (Vehicle $v) => [
            'id'             => $v->id,
            'vehicle_type'   => $v->vehicle_type,
            'label'          => DeliveryFeeService::label($v->vehicle_type),
            'plate_number'   => $v->plate_number,
            'max_tanks'      => (int) $v->max_tanks,
            'max_kg'         => (float) $v->max_capacity_kg,
            'in_use_by'      => ($h = $holders->get($v->id)) ? ($h->user?->first_name ?: $h->user?->name) : null,
            'assigned_to_me' => (int) $v->assigned_rider_id === $rider->id,
            'assigned_rider_id' => $v->assigned_rider_id,
        ])->values()->all();
    }

    /** Full-tank load of a set of deliveries' orders. */
    private static function loadOf(iterable $deliveries): array
    {
        $items = collect($deliveries)->flatMap(fn (Delivery $d) => $d->order?->items ?? []);

        return DeliveryFeeService::orderLoad($items);
    }

    private static function shape(?Vehicle $vehicle, array $load): array
    {
        $maxKg    = $vehicle ? (float) $vehicle->max_capacity_kg : 0.0;
        $maxTanks = $vehicle ? (int) $vehicle->max_tanks : 0;

        return [
            'vehicle'    => $vehicle,
            'kg'         => $load['kg'],
            'tanks'      => $load['tanks'],
            'max_kg'     => $maxKg,
            'max_tanks'  => $maxTanks,
            'free_kg'    => $vehicle ? round(max(0, $maxKg - $load['kg']), 2) : 0.0,
            'free_tanks' => $vehicle ? max(0, $maxTanks - $load['tanks']) : 0,
        ];
    }

    /** The rider's vehicle and what it carries now (active deliveries; failed ones leave the load). */
    public static function load(User $rider, array $excludeOrderIds = []): array
    {
        $deliveries = Delivery::with('order.items.product')->where('rider_id', $rider->id)
            ->whereIn('status', Delivery::ACTIVE_STATUSES)
            ->when($excludeOrderIds, fn ($q) => $q->whereNotIn('order_id', $excludeOrderIds))
            ->get();

        return static::shape(static::currentVehicle($rider), static::loadOf($deliveries));
    }

    /** Payload shape for pages (vehicle as a small array). */
    public static function present(array $load, bool $clockedIn): array
    {
        $v = $load['vehicle'];

        return [
            'clocked_in' => $clockedIn,
            'vehicle'    => $v ? ['id' => $v->id, 'type' => $v->vehicle_type, 'label' => DeliveryFeeService::label($v->vehicle_type), 'plate' => $v->plate_number] : null,
            'load'       => collect($load)->except('vehicle')->all(),
        ];
    }

    /**
     * Pickers: vehicle + load for many riders with TWO queries (open shifts, active deliveries) — never load() per rider.
     *
     * @return array<int, array{clocked_in: bool, vehicle: ?array, load: array}>
     */
    public static function forRiders(iterable $riders): array
    {
        $riders = collect($riders);
        $ids = $riders->pluck('id')->all();
        if (! $ids) {
            return [];
        }
        $shifts = Attendance::with('vehicle')->whereIn('user_id', $ids)
            ->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])
            ->orderByDesc('date')->get()->unique('user_id')->keyBy('user_id');
        $active = Delivery::with('order.items.product')->whereIn('rider_id', $ids)
            ->whereIn('status', Delivery::ACTIVE_STATUSES)->get()->groupBy('rider_id');

        $out = [];
        foreach ($ids as $id) {
            $shift = $shifts->get($id);
            $out[$id] = static::present(static::shape($shift?->vehicle, static::loadOf($active->get($id, []))), $shift !== null);
        }

        return $out;
    }

    /**
     * May this rider take these orders now? The orders being assigned are left out of the current load (re-assigning
     * the same order must not count it twice). Null when OK, else the reason.
     *
     * @param  iterable<\App\Models\Order>  $orders  (items.product are loaded when missing)
     */
    public static function canTake(User $rider, iterable $orders): ?string
    {
        $orders = collect($orders);
        $orders->each(fn ($o) => $o->loadMissing('items.product'));
        $need = DeliveryFeeService::orderLoad($orders->flatMap(fn ($o) => $o->items));
        $name = $rider->first_name ?: $rider->name;

        $vehicle = static::currentVehicle($rider);
        if (! $vehicle) {
            return "{$name} hasn't clocked in with a vehicle yet.";
        }

        // Nothing the store owns could carry it in one trip
        $store = Store::find($rider->store_id ?? $vehicle->store_id);
        $anyFits = $store && DeliveryFeeService::usableVehicles($store)
            ->contains(fn (Vehicle $v) => (float) $v->max_capacity_kg >= $need['kg'] && (int) $v->max_tanks >= $need['tanks']);
        if (! $anyFits && ! ((float) $vehicle->max_capacity_kg >= $need['kg'] && (int) $vehicle->max_tanks >= $need['tanks'])) {
            return 'No vehicle of this store can carry ' . static::kg($need['kg']) . " kg / {$need['tanks']} tanks in one trip — split the order or use pick-up.";
        }

        $load = static::load($rider, $orders->pluck('id')->all());
        if ($need['kg'] > $load['free_kg'] + 0.001 || $need['tanks'] > $load['free_tanks']) {
            return "{$name}'s " . DeliveryFeeService::label($vehicle->vehicle_type) . " {$vehicle->plate_number} has "
                . static::kg($load['free_kg']) . " kg / {$load['free_tanks']} tank(s) free — this needs "
                . static::kg($need['kg']) . " kg / {$need['tanks']} tank(s).";
        }

        return null;
    }

    private static function kg(float $kg): string
    {
        return rtrim(rtrim(number_format($kg, 2, '.', ''), '0'), '.');
    }

    /** Lock the rider's open shift row (serialises concurrent assignments to the same rider). Call inside a transaction. */
    public static function lockShift(User $rider): void
    {
        if ($a = static::openAttendance($rider)) {
            Attendance::whereKey($a->id)->lockForUpdate()->first();
        }
    }

    /** Vehicle status follows the shift: in use while held, available again after (maintenance / retired untouched). */
    public static function holdVehicle(?int $vehicleId): void
    {
        if ($vehicleId) {
            Vehicle::whereKey($vehicleId)->where('status', 'available')->update(['status' => 'in_use']);
        }
    }

    public static function releaseVehicle(?int $vehicleId): void
    {
        if ($vehicleId) {
            Vehicle::whereKey($vehicleId)->where('status', 'in_use')->update(['status' => 'available']);
        }
    }

    public static function activeDeliveryCount(User $rider): int
    {
        return Delivery::where('rider_id', $rider->id)->whereIn('status', Delivery::ACTIVE_STATUSES)->count();
    }

    /**
     * Take / change the shift vehicle with a row lock (two riders picking the same vehicle at once). Returns an error
     * message or null. Call inside a DB transaction.
     */
    public static function takeVehicle(Attendance $shift, User $rider, $vehicleId, Store $store): ?string
    {
        if (! $vehicleId) {
            return 'Choose a vehicle to clock in.';
        }
        $vehicle = Vehicle::whereKey($vehicleId)->where('store_id', $store->id)->lockForUpdate()->first();
        if (! $vehicle || ! DeliveryFeeService::usableVehicles($store)->contains('id', $vehicle->id)) {
            return 'That vehicle is not available.';
        }
        $holder = Attendance::with('user:id,name,first_name')->where('vehicle_id', $vehicle->id)
            ->where('user_id', '!=', $rider->id)->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])->lockForUpdate()->first();
        if ($holder) {
            return 'That vehicle is already being used by ' . ($holder->user?->first_name ?: $holder->user?->name ?: 'another rider') . '.';
        }
        $previous = $shift->vehicle_id;
        $shift->update(['vehicle_id' => $vehicle->id]);
        if ($previous && $previous !== $vehicle->id) {
            static::releaseVehicle($previous);
        }
        static::holdVehicle($vehicle->id);

        return null;
    }
}
