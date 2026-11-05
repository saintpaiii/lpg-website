<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use App\Models\Vehicle;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;
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
                'seen'         => \App\Services\SectionVisitService::flagsFor($request, $d),
                'status'       => $d->status,
                'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
                'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
                'notes'        => $d->notes,
                'fail_info'    => $d->failInfo(),
                'order' => $d->order ? [
                    'id'           => $d->order->id,
                    'order_number' => $d->order->order_number,
                    'customer'     => $d->order->customer?->name ?? '—',
                    'address'      => $d->order->deliveryAddressText() ?: '—',
                    'total_amount' => (float) $d->order->total_amount,
                    // Refill: empty tanks the rider must collect
                    'empty_tanks_required'  => (int) $d->order->empty_tanks_required,
                    'empty_tanks_collected' => $d->order->empty_tanks_collected_at !== null,
                    'empty_tank_summary'    => (int) $d->order->empty_tanks_required > 0 ? $d->order->emptyTankSummary() : null,
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

        $riderRows = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'phone', 'role', 'sub_role']);
        // Driver's license check for every rider in one query (pickers show riders who can't deliver yet as disabled)
        $license = \App\Services\StaffDocumentService::forRiders($riderRows);
        // Shift vehicle + current load per rider (2 queries) — the picker shows free capacity and "Best fit"
        $loads   = \App\Services\RiderLoadService::forRiders($riderRows);
        $riders = $riderRows
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'phone' => $r->phone, 'can_deliver' => $license[$r->id]['can_deliver'], 'license_note' => $license[$r->id]['license_note']] + ($loads[$r->id] ?? []))
            ->values();

        // Available vehicles for this store
        $vehicles = Vehicle::where('store_id', $store->id)
            ->whereIn('status', ['available', 'in_use'])
            ->where('paused_by_plan', false)
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

        // Orders needing assignment (confirmed/preparing, no delivery yet or the last attempt failed)
        $unassigned = Order::where('store_id', $store->id)
            ->whereIn('status', ['confirmed', 'preparing'])
            ->where('fulfillment', 'delivery')   // pick-up orders don't need a rider
            ->where(fn ($q) => $q->whereDoesntHave('delivery')
                ->orWhereHas('delivery', fn ($d) => $d->where('status', 'failed')))
            ->with(['customer', 'delivery', 'items.product'])
            ->latest()
            ->take(50)
            ->get()
            ->map(fn ($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'customer'     => $o->customer?->name ?? '—',
                'status'       => $o->status,
                'redelivery'   => $o->delivery?->failInfo(),
                'load'         => \App\Services\DeliveryFeeService::orderLoad($o->items),
            ])
            ->values();

        $counts = [
            'active'    => Delivery::where('store_id', $store->id)->whereIn('status', ['assigned', 'picked_up', 'in_transit'])->count(),
            'completed' => Delivery::where('store_id', $store->id)->whereIn('status', ['delivered', 'failed'])->count(),
        ];

        return Inertia::render('seller/deliveries', [
            'since'      => \App\Services\SectionVisitService::sinceIso($request),
            'deliveries' => $deliveries,
            'riders'     => $riders,
            'vehicles'   => $vehicles,
            'unassigned' => $unassigned,
            'counts'     => $counts,
            'tab'        => $tab,
            'search'     => $search ?? '',
            'date_from'  => $request->get('date_from') ?: '',
            'date_to'    => $request->get('date_to')   ?: '',
            'fail_options' => Delivery::failOptions(),
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
        if ($order->isPickup()) {
            return back()->with('error', "Pick-up orders don't need a rider.");
        }
        $rider = User::where('id', $data['rider_id'])->where('store_id', $store->id)->where('sub_role', 'rider')->firstOrFail();
        // Riders need an approved, unexpired driver's license
        if ($why = \App\Services\StaffDocumentService::assignmentError($rider)) {
            return back()->with('error', $why);
        }

        // The rider's own shift vehicle carries it (vehicle_id in the request is ignored — kept for old clients).
        // Capacity: the vehicle's total load after this order must stay within its max kg and tanks.
        $vehicle = null;
        try {
            DB::transaction(function () use ($order, $rider, $store, &$vehicle) {
                \App\Services\RiderLoadService::lockShift($rider);
                if ($why = \App\Services\RiderLoadService::canTake($rider, [$order])) {
                    throw new \RuntimeException($why);
                }
                $vehicle = \App\Services\RiderLoadService::currentVehicle($rider);
                $deliveryData = [
                    'rider_id'    => $rider->id,
                    'vehicle_id'  => $vehicle?->id,
                    'assigned_at' => now(),
                    'status'      => 'assigned',
                    'sequence'    => null,
                    'batch_id'    => null,
                ];
                $order->delivery
                    ? $order->delivery->update($deliveryData)
                    : Delivery::create($deliveryData + ['order_id' => $order->id, 'store_id' => $store->id]);

                $order->update(['status' => 'out_for_delivery']);
            });
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

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
            'empty_tanks_collected' => 'nullable|boolean',
            ...Delivery::failureRules($request),
        ], Delivery::failureMessages());

        // Refill: the empty tanks must be collected before Delivered
        if ($data['status'] === 'delivered' && $delivery->order) {
            $delivery->order->assertEmptyTanksCollected($request->has('empty_tanks_collected') ? $request->boolean('empty_tanks_collected') : null, $delivery->rider_id ?? auth()->id());
        }

        // Moving a delivery out of 'assigned' (picked up / on the way / delivered) needs a rider who can deliver
        if ($delivery->status === 'assigned' && in_array($data['status'], ['picked_up', 'in_transit', 'delivered'], true)
            && $delivery->rider && ($why = \App\Services\StaffDocumentService::assignmentError($delivery->rider))) {
            return back()->with('error', $why);
        }

        // Failure details go in the same update as the status so the observer's message sees them
        $delivery->update([
            'status'       => $data['status'],
            'notes'        => $data['notes'] ?? $delivery->notes,
            'delivered_at' => $data['status'] === 'delivered' ? now() : $delivery->delivered_at,
            ...($data['status'] === 'failed' ? Delivery::failureUpdates($data) : []),
        ]);

        // Sync order status
        if ($data['status'] === 'delivered') {
            $delivery->order->update(['status' => 'delivered', 'delivered_at' => now()]);
            \App\Services\OrderPaymentService::handleDelivered($delivery->order->fresh(), $delivery);
            // The vehicle stays with the rider's shift (status follows clock-in / clock-out)
        } elseif ($data['status'] === 'failed') {
            $delivery->order->update(['status' => 'preparing']);
        }

        return back()->with('success', 'Delivery status updated.');
    }
}
