<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RiderLocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class LocationController extends Controller
{
    // POST /rider/location — rider shares their GPS location
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delivery_id' => 'required|integer|exists:deliveries,id',
            'latitude'    => 'required|numeric|between:-90,90',
            'longitude'   => 'required|numeric|between:-180,180',
            'accuracy'    => 'nullable|numeric|min:0',
        ]);

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

        return response()->json([
            'location' => [
                'latitude'  => (float) $loc->latitude,
                'longitude' => (float) $loc->longitude,
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
                'latitude'  => (float) $loc->latitude,
                'longitude' => (float) $loc->longitude,
                'accuracy'  => $loc->accuracy,
                'at'        => $loc->created_at->toIso8601String(),
            ],
        ]);
    }
}
