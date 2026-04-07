<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use App\Models\Vehicle;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DeliveryController extends Controller
{
    public function index(Request $request): Response
    {
        $store  = request()->attributes->get('seller_store');
        $tab    = $request->input('tab', 'active');
        $search = $request->input('search');

        $query = Delivery::where('store_id', $store->id);

        if ($tab === 'completed') {
            $query->whereIn('status', ['delivered', 'failed']);
        } else {
            $query->whereIn('status', ['assigned', 'picked_up', 'in_transit']);
        }

        if ($search) {
            $query->whereHas('order', function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        if ($dateFrom) $query->whereDate('assigned_at', '>=', $dateFrom);
        if ($dateTo)   $query->whereDate('assigned_at', '<=', $dateTo);

        $deliveries = $query->with(['order.customer', 'rider', 'proofs', 'vehicle'])
            ->latest()->paginate(20)->withQueryString()
            ->through(fn ($d) => [
                'id'           => $d->id,
                'status'       => $d->status,
                'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
                'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
                'notes'        => $d->notes,
                'order' => $d->order ? [
                    'id'           => $d->order->id,
                    'order_number' => $d->order->order_number,
                    'customer'     => $d->order->customer?->name ?? '—',
                    'address'      => $d->order->customer
                        ? trim(($d->order->customer->address ?? '') . ', ' . ($d->order->customer->city ?? ''), ', ')
                        : '—',
                    'total_amount' => (float) $d->order->total_amount,
                ] : null,
                'rider'   => $d->rider ? ['id' => $d->rider->id, 'name' => $d->rider->name, 'phone' => $d->rider->phone] : null,
                'vehicle' => $d->vehicle ? [
                    'id'           => $d->vehicle->id,
                    'vehicle_type' => $d->vehicle->vehicle_type,
                    'plate_number' => $d->vehicle->plate_number,
                ] : null,
                'proofs' => $d->proofs->map(fn ($p) => [
                    'id'            => $p->id,
                    'status'        => $p->status,
                    'photo_url'     => $p->photo_path ? Storage::url($p->photo_path) : null,
                    'notes'         => $p->notes,
                    'location_note' => $p->location_note,
                    'created_at'    => $p->created_at->format('M d, Y g:i A'),
                ])->values()->all(),
            ]);

        $riders = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'phone'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'phone' => $r->phone])
            ->values();

        // Available vehicles for this store
        $vehicles = Vehicle::where('store_id', $store->id)
            ->whereIn('status', ['available', 'in_use'])
            ->whereNull('deleted_at')
            ->orderBy('vehicle_type')
            ->get()
            ->map(fn ($v) => [
                'id'              => $v->id,
                'vehicle_type'    => $v->vehicle_type,
                'plate_number'    => $v->plate_number,
                'max_capacity_kg' => (float) $v->max_capacity_kg,
                'max_tanks'       => $v->max_tanks,
                'status'          => $v->status,
            ])
            ->values();

        // Orders needing assignment (confirmed/preparing, no delivery)
        $unassigned = Order::where('store_id', $store->id)
            ->whereIn('status', ['confirmed', 'preparing'])
            ->whereDoesntHave('delivery')
            ->with('customer')
            ->latest()
            ->take(50)
            ->get()
            ->map(fn ($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'customer'     => $o->customer?->name ?? '—',
                'status'       => $o->status,
            ])
            ->values();

        $counts = [
            'active'    => Delivery::where('store_id', $store->id)->whereIn('status', ['assigned', 'picked_up', 'in_transit'])->count(),
            'completed' => Delivery::where('store_id', $store->id)->whereIn('status', ['delivered', 'failed'])->count(),
        ];

        return Inertia::render('seller/deliveries', [
            'deliveries' => $deliveries,
            'riders'     => $riders,
            'vehicles'   => $vehicles,
            'unassigned' => $unassigned,
            'counts'     => $counts,
            'tab'        => $tab,
            'search'     => $search ?? '',
            'date_from'  => $request->get('date_from') ?: '',
            'date_to'    => $request->get('date_to')   ?: '',
        ]);
    }

    public function assign(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'order_id'   => 'required|exists:orders,id',
            'rider_id'   => 'required|exists:users,id',
            'vehicle_id' => 'nullable|exists:vehicles,id',
        ]);

        $order = Order::where('id', $data['order_id'])->where('store_id', $store->id)
            ->with('items.product')->firstOrFail();
        $rider = User::where('id', $data['rider_id'])->where('store_id', $store->id)->firstOrFail();

        $vehicle = null;
        if (! empty($data['vehicle_id'])) {
            $vehicle = Vehicle::where('id', $data['vehicle_id'])->where('store_id', $store->id)->first();
            if (! $vehicle) {
                return back()->withErrors(['vehicle_id' => 'Invalid vehicle.']);
            }

            // Capacity check: total kg of the order vs vehicle max
            $totalKg = $order->items->sum(function ($item) {
                $weightKg = $item->product?->weight_kg ?? 0;
                return $weightKg * $item->quantity;
            });

            if ($totalKg > (float) $vehicle->max_capacity_kg) {
                return back()->with('error', sprintf(
                    'Order total weight (%.1f kg) exceeds %s capacity (%.1f kg). Please choose a larger vehicle.',
                    $totalKg, $vehicle->plate_number, (float) $vehicle->max_capacity_kg
                ));
            }

            // Mark vehicle as in_use
            $vehicle->update(['status' => 'in_use']);
        }

        $deliveryData = [
            'rider_id'    => $rider->id,
            'vehicle_id'  => $vehicle?->id,
            'assigned_at' => now(),
            'status'      => 'assigned',
        ];

        if ($order->delivery) {
            // Free the old vehicle if changing
            if ($order->delivery->vehicle_id && $order->delivery->vehicle_id !== $vehicle?->id) {
                Vehicle::find($order->delivery->vehicle_id)?->update(['status' => 'available']);
            }
            $order->delivery->update($deliveryData);
        } else {
            Delivery::create(array_merge($deliveryData, [
                'order_id' => $order->id,
                'store_id' => $store->id,
            ]));
        }

        $order->update(['status' => 'out_for_delivery']);

        // Notify rider
        $vehicleInfo = $vehicle ? " ({$vehicle->plate_number})" : '';
        NotificationService::send(
            $rider->id,
            'order_update',
            'New Delivery Assigned',
            "You have been assigned to deliver order #{$order->order_number}{$vehicleInfo}.",
            ['link' => '/rider/deliveries']
        );

        $msg = "Delivery assigned to {$rider->name}";
        if ($vehicle) $msg .= " — {$vehicle->plate_number}";

        return back()->with('success', $msg . '.');
    }

    public function updateStatus(Request $request, Delivery $delivery): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($delivery->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'status' => 'required|in:assigned,picked_up,in_transit,delivered,failed',
            'notes'  => 'nullable|string|max:500',
        ]);

        $delivery->update([
            'status'       => $data['status'],
            'notes'        => $data['notes'] ?? $delivery->notes,
            'delivered_at' => $data['status'] === 'delivered' ? now() : $delivery->delivered_at,
        ]);

        // Sync order status
        if ($data['status'] === 'delivered') {
            $delivery->order->update(['status' => 'delivered', 'delivered_at' => now()]);
            // Free the vehicle
            if ($delivery->vehicle_id) {
                Vehicle::find($delivery->vehicle_id)?->update(['status' => 'available']);
            }
        } elseif ($data['status'] === 'failed') {
            $delivery->order->update(['status' => 'preparing']);
            // Free the vehicle on failure too
            if ($delivery->vehicle_id) {
                Vehicle::find($delivery->vehicle_id)?->update(['status' => 'available']);
            }
        }

        return back()->with('success', 'Delivery status updated.');
    }
}
