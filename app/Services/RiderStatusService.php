<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Delivery;
use App\Models\RiderCurrentLocation;
use App\Models\Store;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Rider status board + live map for the seller (J6 Part C), and the "next stop" privacy rule for customers.
 *
 * Statuses: off_shift (not clocked in) · available (clocked in, no active stop) · on_delivery (n stops) ·
 * returning (no active stop, last stop done < 30 min ago) · no_gps (on delivery, last GPS point > 10 min old).
 * There is no break flag on attendance, so "On break" is not shown.
 */
class RiderStatusService
{
    public const RETURNING_MINUTES = 30;
    public const NO_GPS_MINUTES = 10;

    public const LABELS = [
        'off_shift'   => 'Off shift',
        'available'   => 'Available',
        'on_delivery' => 'On delivery',
        'returning'   => 'Returning',
        'no_gps'      => 'No GPS',
    ];

    /** Pure: the status from the facts. */
    public static function statusFor(bool $onShift, int $activeStops, ?CarbonInterface $lastDoneAt, ?CarbonInterface $lastPointAt, ?CarbonInterface $now = null): string
    {
        $now ??= Carbon::now();
        if (! $onShift) {
            return 'off_shift';
        }
        if ($activeStops > 0) {
            return ! $lastPointAt || $lastPointAt->lt($now->copy()->subMinutes(self::NO_GPS_MINUTES)) ? 'no_gps' : 'on_delivery';
        }

        return $lastDoneAt && $lastDoneAt->gte($now->copy()->subMinutes(self::RETURNING_MINUTES)) ? 'returning' : 'available';
    }

    /** Active deliveries in the order the rider works them: in transit first, then the batch sequence, then assigned time. */
    public static function orderStops($deliveries)
    {
        return collect($deliveries)->sortBy(fn (Delivery $d) => [
            $d->status === 'in_transit' ? 0 : 1,
            $d->sequence ?? PHP_INT_MAX,
            $d->assigned_at?->getTimestamp() ?? PHP_INT_MAX,
            $d->id,
        ])->values();
    }

    /** The delivery the rider is heading to now (null = none) — customers get the EXACT position only for this one. */
    public static function nextStopId(int $riderId): ?int
    {
        $active = Delivery::where('rider_id', $riderId)->whereIn('status', Delivery::ACTIVE_STATUSES)->get();

        return static::orderStops($active)->first()?->id;
    }

    /** May the customer of this delivery see the rider's exact position? Only on the way (picked up / in transit) AND next stop. */
    public static function exactForCustomer(Delivery $delivery): bool
    {
        return in_array($delivery->status, ['picked_up', 'in_transit'], true) && static::nextStopId((int) $delivery->rider_id) === $delivery->id;
    }

    /** Is the rider on an open shift right now? (broadcasts for Available riders stop at clock-out) */
    public static function onShift(int $riderId): bool
    {
        return Attendance::where('user_id', $riderId)->whereNotNull('clock_in')->whereNull('clock_out')
            ->whereIn('date', [now()->toDateString(), now()->subDay()->toDateString()])->exists();
    }

    /**
     * Board + map rows for every active rider of the store. Exact positions (store side) only while on shift.
     *
     * @return array<int, array>
     */
    public static function board(Store $store): array
    {
        $riders = User::where('store_id', $store->id)->where('role', 'seller_staff')->where('sub_role', 'rider')
            ->where('is_active', true)->orderBy('name')->get(['id', 'name', 'first_name', 'last_name', 'phone']);
        $ids = $riders->pluck('id')->all();
        if (! $ids) {
            return [];
        }
        $loads  = RiderLoadService::forRiders($riders);
        $points = RiderCurrentLocation::whereIn('user_id', $ids)->get()->keyBy('user_id');
        $active = Delivery::with(['order:id,order_number,customer_id,delivery_latitude,delivery_longitude,delivery_address,delivery_barangay', 'order.customer:id,name'])
            ->whereIn('rider_id', $ids)->whereIn('status', Delivery::ACTIVE_STATUSES)->get()->groupBy('rider_id');
        $lastDone = Delivery::whereIn('rider_id', $ids)->whereIn('status', ['delivered', 'failed'])
            ->where('updated_at', '>=', now()->subHours(3))
            ->selectRaw('rider_id, MAX(COALESCE(delivered_at, failed_at, updated_at)) as done_at')->groupBy('rider_id')->pluck('done_at', 'rider_id');

        return $riders->map(function (User $r) use ($loads, $points, $active, $lastDone) {
            $l      = $loads[$r->id] ?? ['clocked_in' => false, 'vehicle' => null, 'load' => []];
            $p      = $points->get($r->id);
            $stops  = static::orderStops($active->get($r->id, []));
            $done   = ($d = $lastDone[$r->id] ?? null) ? Carbon::parse($d) : null;
            $status = static::statusFor((bool) $l['clocked_in'], $stops->count(), $done, $p?->updated_at);

            return [
                'id'           => $r->id,
                'name'         => $r->first_name ?: $r->name,
                'full_name'    => $r->name,
                'initials'     => collect(preg_split('/\s+/', trim((string) $r->name)))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->implode(''),
                'avatar_url'   => null,   // users have no photo column — the card shows initials
                'phone'        => $r->phone,
                'status'       => $status,
                'status_label' => self::LABELS[$status],
                'vehicle'      => $l['vehicle'],
                'load'         => $l['load'] ?: null,
                'stops'        => $stops->map(fn (Delivery $d) => [
                    'delivery_id'  => $d->id,
                    'order_id'     => $d->order_id,
                    'order_number' => $d->order?->order_number,
                    'customer'     => $d->order?->customer?->name,
                    'status'       => $d->status,
                    'lat'          => $d->order?->delivery_latitude !== null ? (float) $d->order->delivery_latitude : null,
                    'lng'          => $d->order?->delivery_longitude !== null ? (float) $d->order->delivery_longitude : null,
                ])->all(),
                'current_stop' => $stops->first()?->order?->customer?->name,
                // Exact point for the store — only while on shift (never after clock-out)
                'position'     => $l['clocked_in'] && $p ? ['lat' => (float) $p->latitude, 'lng' => (float) $p->longitude] : null,
                'last_seen_at' => $p?->updated_at?->toIso8601String(),
                'last_seen'    => $p?->updated_at?->diffForHumans(['short' => false, 'syntax' => CarbonInterface::DIFF_RELATIVE_TO_NOW]),
            ];
        })->values()->all();
    }
}
