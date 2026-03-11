<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeliveryController extends Controller
{
    private function formatDelivery(Delivery $d): array
    {
        return [
            'id'           => $d->id,
            'status'       => $d->status,
            'notes'        => $d->notes,
            'assigned_at'  => $d->assigned_at?->toIso8601String(),
            'delivered_at' => $d->delivered_at?->toIso8601String(),
            'rider' => $d->rider ? [
                'id'    => $d->rider->id,
                'name'  => $d->rider->name,
                'phone' => $d->rider->phone,
            ] : null,
            'order' => $d->order ? [
                'id'               => $d->order->id,
                'order_number'     => $d->order->order_number,
                'status'           => $d->order->status,
                'total_amount'     => (float) $d->order->total_amount,
                'transaction_type' => $d->order->transaction_type,
                'payment_method'   => $d->order->payment_method,
                'payment_status'   => $d->order->payment_status,
                'customer' => $d->order->customer ? [
                    'id'      => $d->order->customer->id,
                    'name'    => $d->order->customer->name,
                    'phone'   => $d->order->customer->phone,
                    'address' => $d->order->customer->address,
                    'barangay'=> $d->order->customer->barangay,
                    'city'    => $d->order->customer->city,
                    'lat'     => $d->order->customer->lat,
                    'lng'     => $d->order->customer->lng,
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

    // ── GET /api/deliveries ───────────────────────────────────────────────────
    // Admin: all deliveries. Rider: own deliveries only.

    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = Delivery::with(['order.customer', 'order.items.product', 'rider']);

        if ($user->role === 'rider') {
            $query->where('rider_id', $user->id);
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $deliveries = $query->latest()->paginate(20);

        return response()->json([
            'data'         => $deliveries->map(fn ($d) => $this->formatDelivery($d)),
            'current_page' => $deliveries->currentPage(),
            'last_page'    => $deliveries->lastPage(),
            'total'        => $deliveries->total(),
        ]);
    }

    // ── GET /api/deliveries/{delivery} ────────────────────────────────────────

    public function show(Request $request, Delivery $delivery): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'rider' && $delivery->rider_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $delivery->load(['order.customer', 'order.items.product', 'rider']);

        return response()->json($this->formatDelivery($delivery));
    }

    // ── PUT /api/deliveries/{delivery}/status ─────────────────────────────────

    public function updateStatus(Request $request, Delivery $delivery): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'rider' && $delivery->rider_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $data = $request->validate([
            'status' => 'required|in:picked_up,in_transit,delivered,failed',
            'notes'  => 'nullable|string|max:500',
        ]);

        $newStatus = $data['status'];

        if (in_array($delivery->status, ['delivered', 'failed'])) {
            return response()->json(['message' => 'Cannot change status of a completed delivery.'], 422);
        }

        if ($newStatus === 'failed' && empty($data['notes'])) {
            return response()->json(['message' => 'Notes are required when marking a delivery as failed.'], 422);
        }

        // Riders follow strict progression; admins can jump
        if ($user->role === 'rider') {
            $allowed = [
                'assigned'   => ['picked_up', 'failed'],
                'picked_up'  => ['in_transit', 'failed'],
                'in_transit' => ['delivered', 'failed'],
            ];

            if (! in_array($newStatus, $allowed[$delivery->status] ?? [])) {
                return response()->json(['message' => "Cannot move from {$delivery->status} to {$newStatus}."], 422);
            }
        }

        DB::transaction(function () use ($delivery, $newStatus, $data) {
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
            }

            if ($newStatus === 'failed') {
                $delivery->order?->update(['status' => 'preparing']);
            }

            $delivery->update($updates);
        });

        $delivery->load(['order.customer', 'order.items.product', 'rider']);

        return response()->json($this->formatDelivery($delivery));
    }

    // ── POST /api/deliveries/assign (admin only) ──────────────────────────────

    public function assign(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->role !== 'admin' && ! $user->is_admin) {
            return response()->json(['message' => 'Unauthorized. Admin access required.'], 403);
        }

        $data = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'rider_id' => 'required|exists:users,id',
            'notes'    => 'nullable|string|max:500',
        ]);

        $order = Order::findOrFail($data['order_id']);

        if ($order->delivery()->exists()) {
            return response()->json(['message' => 'This order already has a delivery assigned.'], 422);
        }

        if (! in_array($order->status, ['confirmed', 'preparing'])) {
            return response()->json(['message' => 'Can only assign delivery for confirmed or preparing orders.'], 422);
        }

        $delivery = DB::transaction(function () use ($data, $order) {
            $delivery = Delivery::create([
                'order_id'    => $order->id,
                'rider_id'    => $data['rider_id'],
                'status'      => 'assigned',
                'notes'       => $data['notes'] ?? null,
                'assigned_at' => now(),
            ]);

            $order->update(['status' => 'out_for_delivery']);

            return $delivery;
        });

        $delivery->load(['order.customer', 'order.items.product', 'rider']);

        return response()->json($this->formatDelivery($delivery), 201);
    }
}
