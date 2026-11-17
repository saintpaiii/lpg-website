<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RiderCurrentLocation;
use App\Models\RiderLocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class LocationController extends Controller
{
    /**
     * POST /rider/location — rider shares their GPS location.
     * Always upserts the rider's single current position (used by the route map and
     * customer tracking). With a delivery_id it also appends to that delivery's history,
     * as the existing per-delivery "share location" does.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_id' => 'nullable|integer|exists:deliveries,id',
            'latitude'    => 'required|numeric|between:-90,90',
            'longitude'   => 'required|numeric|between:-180,180',
            'accuracy'    => 'nullable|numeric|min:0',
        ]);

        RiderCurrentLocation::record(auth()->id(), (float) $data['latitude'], (float) $data['longitude']);
        $this->broadcastPosition(auth()->id(), (float) $data['latitude'], (float) $data['longitude']);

        if (empty($data['delivery_id'])) {
            return response()->json(['success' => true, 'at' => now()->toIso8601String()]);
        }

        $delivery = Delivery::findOrFail($data['delivery_id']);

        if ($delivery->rider_id !== auth()->id()) {
            return response()->json(['error' => 'Unauthorized.'], 403);
        }

        if (in_array($delivery->status, ['delivered', 'failed'])) {
            return response()->json(['error' => 'Delivery is already completed.'], 422);
        }

        RiderLocation::create([
            'delivery_id' => $delivery->id,
            'rider_id'    => auth()->id(),
            'latitude'    => $data['latitude'],
            'longitude'   => $data['longitude'],
            'accuracy'    => $data['accuracy'] ?? null,
        ]);

        // Keep only last 50 records per delivery
        $ids = RiderLocation::where('delivery_id', $delivery->id)
            ->orderByDesc('id')
            ->skip(50)
            ->pluck('id');
        if ($ids->isNotEmpty()) {
            RiderLocation::whereIn('id', $ids)->delete();
        }

        return response()->json(['success' => true, 'at' => now()->toIso8601String()]);
    }

    /**
     * Live position for each of the rider's active deliveries: the store gets it exact; the customer gets it EXACT only
     * while their order is the rider's next stop (picked up / in transit — RiderStatusService::exactForCustomer), else
     * rounded to 2 decimals (~1 km) so other customers' stops stay private. J6: a rider on shift with no active delivery
     * still shows on the store's live map (Available) — but only while clocked in, never after clock-out.
     */
    private function broadcastPosition(int $riderId, float $lat, float $lng): void
    {
        if (! \App\Support\Realtime::enabled()) {
            return;
        }
        try {
            $at = now()->toIso8601String();
            $active = Delivery::with('order.customer:id,user_id')->where('rider_id', $riderId)
                ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])->get();

            foreach ($active->groupBy(fn ($d) => $d->store_id ?? $d->order?->store_id) as $storeId => $deliveries) {
                \App\Support\Realtime::send(new \App\Events\RiderLocationUpdated([
                    'rider_id' => $riderId, 'lat' => $lat, 'lng' => $lng, 'updated_at' => $at,
                    'delivery_ids' => $deliveries->pluck('id')->values(),
                ], ["store.{$storeId}"]));
            }
            // Available (no active delivery): the store's map still shows them — only while on shift
            if ($active->isEmpty() && \App\Services\RiderStatusService::onShift($riderId)
                && ($storeId = \App\Models\User::whereKey($riderId)->value('store_id'))) {
                \App\Support\Realtime::send(new \App\Events\RiderLocationUpdated([
                    'rider_id' => $riderId, 'lat' => $lat, 'lng' => $lng, 'updated_at' => $at, 'delivery_ids' => [],
                ], ["store.{$storeId}"]));
            }
            $next = \App\Services\RiderStatusService::orderStops($active)->first()?->id;
            foreach ($active as $d) {
                if ($userId = $d->order?->customer?->user_id) {
                    $exact = $d->id === $next && in_array($d->status, ['picked_up', 'in_transit'], true);
                    \App\Support\Realtime::send(new \App\Events\RiderLocationUpdated([
                        'order_id' => $d->order_id, 'delivery_id' => $d->id,
                        'lat' => $exact ? $lat : round($lat, 2), 'lng' => $exact ? $lng : round($lng, 2), 'exact' => $exact, 'updated_at' => $at,
                    ], ["user.{$userId}"]));
                }
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Rider location live update failed', ['rider_id' => $riderId, 'error' => $e->getMessage()]);
        }
    }

    // GET /customer/orders/{order}/rider-location — customer polls rider location for their own order
    public function showForOrder(Order $order): JsonResponse
    {
        $customer = Customer::where('user_id', auth()->id())->first();
        if (! $customer || $order->customer_id !== $customer->id) {
            return response()->json(['error' => 'Unauthorized.'], 403);
        }

        $delivery = $order->delivery;
        if (! $delivery) {
            return response()->json(['location' => null]);
        }

        $loc = RiderLocation::where('delivery_id', $delivery->id)
            ->latest()
            ->first();

        if (! $loc) {
            return response()->json(['location' => null]);
        }

        // Exact only while this order is the rider's next stop (J6); otherwise an approximate area (≈1.1 km)
        $exact = \App\Services\RiderStatusService::exactForCustomer($delivery);
        return response()->json([
            'location' => [
                'latitude'  => $exact ? (float) $loc->latitude : round((float) $loc->latitude, 2),
                'longitude' => $exact ? (float) $loc->longitude : round((float) $loc->longitude, 2),
                'exact'     => $exact,
                'at'        => $loc->created_at->toIso8601String(),
            ],
        ]);
    }

    // GET /rider/deliveries/{delivery}/rider-location — latest location for a delivery
    public function show(Delivery $delivery): JsonResponse
    {
        // Allow rider (owner) or customer who placed the order
        $user = auth()->user();
        $isRider    = $delivery->rider_id === $user->id;
        $isCustomer = false;

        if (! $isRider) {
            // Check if this is the customer's order
            $customer = Customer::where('user_id', $user->id)->first();
            if ($customer && $delivery->order?->customer_id === $customer->id) {
                $isCustomer = true;
            }
        }

        if (! $isRider && ! $isCustomer) {
            return response()->json(['error' => 'Unauthorized.'], 403);
        }

        $loc = RiderLocation::where('delivery_id', $delivery->id)
            ->latest()
            ->first();

        if (! $loc) {
            return response()->json(['location' => null]);
        }

        return response()->json([
            'location' => [
                'latitude'  => $isRider || \App\Services\RiderStatusService::exactForCustomer($delivery) ? (float) $loc->latitude : round((float) $loc->latitude, 2),
                'longitude' => $isRider || \App\Services\RiderStatusService::exactForCustomer($delivery) ? (float) $loc->longitude : round((float) $loc->longitude, 2),
                'accuracy'  => $isRider ? $loc->accuracy : null,
                'at'        => $loc->created_at->toIso8601String(),
            ],
        ]);
    }
}
