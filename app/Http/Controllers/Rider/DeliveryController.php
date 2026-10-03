<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\DeliveryProof;
use App\Models\RiderLocation;
use App\Services\NotificationService;
use App\Services\OrderPaymentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class DeliveryController extends Controller
{
    private function formatDelivery(Delivery $d): array
    {
        return [
            'id'           => $d->id,
            'status'       => $d->status,
            'notes'        => $d->notes,
            'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
            'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
            'vehicle' => $d->vehicle ? [
                'vehicle_type' => $d->vehicle->vehicle_type,
                'plate_number' => $d->vehicle->plate_number,
            ] : null,
            'order' => $d->order ? [
                'id'                 => $d->order->id,
                'order_number'       => $d->order->order_number,
                'status'             => $d->order->status,
                'total_amount'       => (float) $d->order->total_amount,
                'shipping_fee'       => $d->order->shipping_fee ? (float) $d->order->shipping_fee : null,
                'transaction_type'   => $d->order->transaction_type,
                'payment_method'     => $d->order->payment_method,
                'payment_status'     => $d->order->payment_status,
                'payment_mode'       => $d->order->payment_mode ?? 'full',
                'amount_to_collect'  => $d->order->payment_mode === 'cod' && $d->order->payment_status === 'unpaid'
                    ? $d->order->grandTotal()
                    : 0,
                'remaining_balance'  => $d->order->remaining_balance ? (float) $d->order->remaining_balance : null,
                'delivery_latitude'           => $d->order->delivery_latitude  ? (float) $d->order->delivery_latitude  : null,
                'delivery_longitude'          => $d->order->delivery_longitude ? (float) $d->order->delivery_longitude : null,
                'delivery_distance_km'        => $d->order->delivery_distance_km       ? (float) $d->order->delivery_distance_km       : null,
                'estimated_delivery_minutes'  => $d->order->estimated_delivery_minutes ? (int)   $d->order->estimated_delivery_minutes : null,
                'store_location' => ($d->order->store?->latitude && $d->order->store?->longitude) ? [
                    'lat'  => (float) $d->order->store->latitude,
                    'lng'  => (float) $d->order->store->longitude,
                    'name' => $d->order->store->store_name,
                ] : null,
                'customer' => $d->order->customer ? [
                    'id'      => $d->order->customer->id,
                    'name'    => $d->order->customer->name,
                    'phone'   => $d->order->customer->phone,
                    'address' => $d->order->deliveryAddressParts()['address'],
                    'barangay'=> $d->order->deliveryAddressParts()['barangay'],
                    'city'    => $d->order->deliveryAddressParts()['city'],
                ] : null,
                'items' => $d->order->items->map(fn ($item) => [
                    'id'         => $item->id,
                    'quantity'   => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal'   => (float) $item->subtotal,
                    'product'    => $item->product ? [
                        'id'    => $item->product->id,
                        'name'  => $item->product->name,
                        'brand' => $item->product->brand,
                    ] : null,
                ])->values()->all(),
            ] : null,
        ];
    }

    // ── My Deliveries (Active + History) ──────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab  = $request->input('tab', 'active');
        $user = auth()->user();

        $query = Delivery::with(['order.customer', 'order.items.product', 'order.store', 'vehicle'])
            ->where('rider_id', $user->id);

        if ($tab === 'history') {
            $query->whereIn('status', ['delivered', 'failed']);
        } else {
            $query->whereIn('status', ['assigned', 'picked_up', 'in_transit']);
        }

        $deliveries = $query
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($d) => $this->formatDelivery($d));

        // Summary counts
        $counts = Delivery::where('rider_id', $user->id)
            ->selectRaw("
                SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_count,
                SUM(CASE WHEN status = 'picked_up' THEN 1 ELSE 0 END) as picked_up_count,
                SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit_count,
                SUM(CASE WHEN status = 'delivered' AND DATE(delivered_at) = CURDATE() THEN 1 ELSE 0 END) as delivered_today_count
            ")
            ->first();

        return Inertia::render('rider/deliveries', [
            'deliveries'  => $deliveries,
            'tab'         => $tab,
            'counts'      => [
                'assigned'        => (int) ($counts->assigned_count ?? 0),
                'picked_up'       => (int) ($counts->picked_up_count ?? 0),
                'in_transit'      => (int) ($counts->in_transit_count ?? 0),
                'delivered_today' => (int) ($counts->delivered_today_count ?? 0),
            ],
            'filters' => $request->only('tab'),
            'route'   => $this->routeData($user),
        ]);
    }

    /**
     * Stops for the rider's map view: active deliveries plus anything finished today
     * (so completed stops show green/gray), in route order — batch by batch, then by
     * sequence within a batch; individually assigned deliveries follow by assignment time.
     */
    private function routeData($user): array
    {
        $stops = Delivery::with(['order.customer', 'order.store'])
            ->where('rider_id', $user->id)
            ->where(fn ($q) => $q->whereIn('status', ['assigned', 'picked_up', 'in_transit'])
                ->orWhere(fn ($w) => $w->whereIn('status', ['delivered', 'failed'])->where('updated_at', '>=', now()->startOfDay())))
            ->get()
            ->sortBy(fn (Delivery $d) => [$d->batch_id ? 0 : 1, optional($d->assigned_at)->timestamp ?? 0, $d->sequence ?? 0])
            ->values();

        $modeLabels = ['full' => 'Full Payment', 'consignment' => 'Consignment', 'cod' => 'COD'];

        return [
            'store' => \App\Services\DeliveryRouteService::storeLocation($user->store_id ? \App\Models\Store::find($user->store_id) : null),
            'stops' => $stops->map(function (Delivery $d, int $i) use ($modeLabels) {
                $o = $d->order;
                return [
                    'id'                => $d->id,
                    'number'            => $i + 1,
                    'sequence'          => $d->sequence,
                    'batch_id'          => $d->batch_id,
                    'status'            => $d->status,
                    'order_number'      => $o?->order_number,
                    'customer_name'     => $o?->customer?->name ?? '—',
                    'customer_phone'    => $o?->customer?->phone,
                    'address'           => $o?->deliveryAddressText() ?? '',
                    'lat'               => $o?->delivery_latitude ? (float) $o->delivery_latitude : null,
                    'lng'               => $o?->delivery_longitude ? (float) $o->delivery_longitude : null,
                    'amount'            => $o ? $o->grandTotal() : 0,
                    'payment_label'     => $modeLabels[$o?->payment_mode ?? 'full'] ?? 'Full Payment',
                    'amount_to_collect' => $o && $o->payment_mode === 'cod' && $o->payment_status === 'unpaid' ? $o->grandTotal() : 0,
                ];
            })->all(),
        ];
    }

    // ── Delivery History (completed) ──────────────────────────────────────────

    public function history(Request $request): Response
    {
        $user = auth()->user();

        $deliveries = Delivery::with(['order.customer', 'proofs'])
            ->where('rider_id', $user->id)
            ->whereIn('status', ['delivered', 'failed'])
            ->latest('delivered_at')
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($d) => [
                'id'           => $d->id,
                'status'       => $d->status,
                'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
                'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
                'notes'        => $d->notes,
                'order' => $d->order ? [
                    'id'           => $d->order->id,
                    'order_number' => $d->order->order_number,
                    'total_amount' => (float) $d->order->total_amount,
                    'customer'     => $d->order->customer ? [
                        'name'     => $d->order->customer->name,
                        'address'  => $d->order->deliveryAddressParts()['address'],
                        'barangay' => $d->order->deliveryAddressParts()['barangay'],
                        'city'     => $d->order->deliveryAddressParts()['city'],
                    ] : null,
                ] : null,
                'proofs' => $d->proofs->map(fn ($p) => [
                    'status'        => $p->status,
                    'photo_url'     => $p->photo_path ? Storage::url($p->photo_path) : null,
                    'notes'         => $p->notes,
                    'location_note' => $p->location_note,
                    'created_at'    => $p->created_at->format('M d, Y g:i A'),
                ])->values()->all(),
            ]);

        $totals = Delivery::where('rider_id', $user->id)
            ->selectRaw("
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
                SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed_count
            ")
            ->first();

        return Inertia::render('rider/history', [
            'deliveries' => $deliveries,
            'totals'     => [
                'delivered' => (int) ($totals->delivered_count ?? 0),
                'failed'    => (int) ($totals->failed_count    ?? 0),
            ],
        ]);
    }

    // ── Update Status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Delivery $delivery): RedirectResponse
    {
        // Ensure rider owns this delivery
        if ($delivery->rider_id !== auth()->id()) {
            abort(403, 'Unauthorized.');
        }

        $needsPhoto = in_array($request->input('status'), ['picked_up', 'delivered', 'failed']);

        $data = $request->validate([
            'status'            => 'required|in:picked_up,in_transit,delivered,failed',
            'notes'             => 'nullable|string|max:500',
            'location_note'     => 'nullable|string|max:255',
            'photo'             => ($needsPhoto ? 'required' : 'nullable') . '|image|mimes:jpeg,png,jpg|max:5120',
            'rider_latitude'    => 'nullable|numeric|between:-90,90',
            'rider_longitude'   => 'nullable|numeric|between:-180,180',
            'rider_accuracy'    => 'nullable|numeric|min:0',
        ]);

        $newStatus = $data['status'];

        if (in_array($delivery->status, ['delivered', 'failed'])) {
            return back()->with('error', 'Cannot change status of a completed delivery.');
        }

        if ($newStatus === 'failed' && empty($data['notes'])) {
            return back()->with('error', 'Please provide a reason when marking delivery as failed.');
        }

        // Validate progression
        $allowed = [
            'assigned'   => ['picked_up', 'failed'],
            'picked_up'  => ['in_transit', 'failed'],
            'in_transit' => ['delivered', 'failed'],
        ];

        if (! in_array($newStatus, $allowed[$delivery->status] ?? [])) {
            return back()->with('error', "Cannot move from {$delivery->status} to {$newStatus}.");
        }

        $riderLocSaved = false;
        DB::transaction(function () use ($delivery, $newStatus, $data, $request, &$riderLocSaved) {
            $updates = ['status' => $newStatus];

            if (! empty($data['notes'])) {
                $updates['notes'] = $data['notes'];
            }

            if ($newStatus === 'delivered' && ! $delivery->delivered_at) {
                $updates['delivered_at'] = now();
                $delivery->order?->update([
                    'status'       => 'delivered',
                    'delivered_at' => now(),
                ]);
                if ($delivery->order) {
                    OrderPaymentService::handleDelivered($delivery->order->fresh(), $delivery);
                }
            }

            if ($newStatus === 'failed') {
                $delivery->order?->update(['status' => 'preparing']);
            }

            $delivery->update($updates);

            // Store proof record
            $photoPath = null;
            if ($request->hasFile('photo')) {
                $photoPath = $request->file('photo')->store('delivery_proofs', 'public');
            }

            DeliveryProof::create([
                'delivery_id'   => $delivery->id,
                'user_id'       => auth()->id(),
                'status'        => $newStatus,
                'photo_path'    => $photoPath,
                'notes'         => $data['notes'] ?? null,
                'location_note' => $data['location_note'] ?? null,
            ]);

            // Save rider GPS snapshot (if provided)
            if (! empty($data['rider_latitude']) && ! empty($data['rider_longitude'])) {
                RiderLocation::create([
                    'delivery_id' => $delivery->id,
                    'rider_id'    => auth()->id(),
                    'latitude'    => $data['rider_latitude'],
                    'longitude'   => $data['rider_longitude'],
                    'accuracy'    => $data['rider_accuracy'] ?? null,
                ]);
                $riderLocSaved = true;
            }
        });

        $label = ucfirst(str_replace('_', ' ', $newStatus));
        return back()->with('success', "Delivery marked as {$label}.");
    }

    // ── COD: Payment Collected ────────────────────────────────────────────────

    public function collectPayment(Delivery $delivery): RedirectResponse
    {
        if ($delivery->rider_id !== auth()->id()) {
            abort(403, 'Unauthorized.');
        }

        $order = $delivery->order;

        if (! $order || $order->payment_mode !== 'cod') {
            return back()->with('error', 'This is not a Cash on Delivery order.');
        }
        if ($delivery->status !== 'delivered') {
            return back()->with('error', 'Mark the order as delivered before recording the payment.');
        }
        if ($order->payment_status === 'paid') {
            return back()->with('error', 'Payment was already recorded for this order.');
        }

        DB::transaction(fn () => OrderPaymentService::markPaid($order, 'cash'));

        if ($order->store_id) {
            NotificationService::sendToStore(
                $order->store_id,
                'payment',
                'COD Payment Collected',
                'Rider ' . auth()->user()->name . " collected ₱" . number_format($order->grandTotal(), 2) . " cash for order {$order->order_number}.",
                ['order_id' => $order->id, 'link' => '/seller/orders/' . $order->id]
            );
        }

        return back()->with('success', "Cash payment recorded for {$order->order_number}.");
    }
}
