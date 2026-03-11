<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DeliveryController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private function formatDelivery(Delivery $d): array
    {
        return [
            'id'           => $d->id,
            'status'       => $d->status,
            'notes'        => $d->notes,
            'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
            'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
            'deleted_at'   => $d->deleted_at?->format('M d, Y g:i A'),
            'rider' => $d->rider ? [
                'id'    => $d->rider->id,
                'name'  => $d->rider->name,
                'phone' => $d->rider->phone,
            ] : null,
            'order' => $d->order ? [
                'id'           => $d->order->id,
                'order_number' => $d->order->order_number,
                'status'       => $d->order->status,
                'total_amount' => (float) $d->order->total_amount,
                'customer' => $d->order->customer ? [
                    'id'      => $d->order->customer->id,
                    'name'    => $d->order->customer->name,
                    'phone'   => $d->order->customer->phone,
                    'address' => $d->order->customer->address,
                    'barangay'=> $d->order->customer->barangay,
                    'city'    => $d->order->customer->city,
                ] : null,
                'items_count' => $d->order->items->count(),
            ] : null,
        ];
    }

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'active');

        $query = Delivery::with(['order.customer', 'order.items', 'rider']);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($riderId = $request->input('rider_id')) {
            $query->where('rider_id', $riderId);
        }

        if ($dateFrom = $request->input('date_from')) {
            $query->whereDate('assigned_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->input('date_to')) {
            $query->whereDate('assigned_at', '<=', $dateTo);
        }

        $deliveries = $query
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($d) => $this->formatDelivery($d));

        $archivedCount = Delivery::onlyTrashed()->count();

        // Orders ready for delivery assignment
        $pendingOrders = Order::with(['customer', 'items'])
            ->whereIn('status', ['confirmed', 'preparing'])
            ->whereDoesntHave('delivery')
            ->latest()
            ->get()
            ->map(fn ($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'status'       => $o->status,
                'total_amount' => (float) $o->total_amount,
                'customer' => $o->customer ? [
                    'id'      => $o->customer->id,
                    'name'    => $o->customer->name,
                    'phone'   => $o->customer->phone,
                    'address' => $o->customer->address,
                    'barangay'=> $o->customer->barangay,
                    'city'    => $o->customer->city,
                ] : null,
                'items_count' => $o->items->count(),
            ]);

        // Riders list
        $riders = User::where('role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'phone']);

        // Rider workload: active delivery counts per rider
        $riderWorkload = User::where('role', 'rider')
            ->where('is_active', true)
            ->withCount(['deliveries as active_deliveries_count' => function ($q) {
                $q->whereIn('status', ['assigned', 'picked_up', 'in_transit']);
            }])
            ->orderBy('name')
            ->get()
            ->map(fn ($r) => [
                'id'                    => $r->id,
                'name'                  => $r->name,
                'phone'                 => $r->phone,
                'active_deliveries_count' => $r->active_deliveries_count,
            ]);

        return Inertia::render('admin/deliveries', [
            'deliveries'    => $deliveries,
            'pendingOrders' => $pendingOrders,
            'riders'        => $riders,
            'riderWorkload' => $riderWorkload,
            'archivedCount' => $archivedCount,
            'tab'           => $tab,
            'filters'       => $request->only('status', 'rider_id', 'date_from', 'date_to', 'tab'),
        ]);
    }

    // ── Store (assign delivery) ────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'rider_id' => 'required|exists:users,id',
            'notes'    => 'nullable|string|max:500',
        ]);

        $order = Order::findOrFail($data['order_id']);

        if ($order->delivery()->exists()) {
            return back()->with('error', 'This order already has a delivery assigned.');
        }

        if (! in_array($order->status, ['confirmed', 'preparing'])) {
            return back()->with('error', 'Can only assign delivery for confirmed or preparing orders.');
        }

        DB::transaction(function () use ($data, $order) {
            Delivery::create([
                'order_id'    => $order->id,
                'rider_id'    => $data['rider_id'],
                'status'      => 'assigned',
                'notes'       => $data['notes'] ?? null,
                'assigned_at' => now(),
            ]);

            $order->update(['status' => 'out_for_delivery']);
        });

        return back()->with('success', "Delivery assigned for order {$order->order_number}.");
    }

    // ── Update Status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Delivery $delivery): RedirectResponse
    {
        $data = $request->validate([
            'status' => 'required|in:assigned,picked_up,in_transit,delivered,failed',
            'notes'  => 'nullable|string|max:500',
        ]);

        $newStatus = $data['status'];

        if (in_array($delivery->status, ['delivered', 'failed'])) {
            return back()->with('error', 'Cannot change status of a completed delivery.');
        }

        if ($newStatus === 'failed' && empty($data['notes'])) {
            return back()->with('error', 'Please provide a reason when marking delivery as failed.');
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
                // Revert order back to preparing so admin can re-assign
                $delivery->order?->update(['status' => 'preparing']);
            }

            $delivery->update($updates);
        });

        $orderNum = $delivery->order?->order_number ?? 'order';
        $label    = ucfirst(str_replace('_', ' ', $newStatus));
        return back()->with('success', "Delivery marked as {$label} for {$orderNum}.");
    }

    // ── Destroy (soft delete / archive) ───────────────────────────────────────

    public function destroy(Delivery $delivery): RedirectResponse
    {
        if (! in_array($delivery->status, ['delivered', 'failed'])) {
            return back()->with('error', 'Only delivered or failed deliveries can be archived.');
        }

        $delivery->delete();

        $orderNum = $delivery->order?->order_number ?? 'delivery';
        return back()->with('success', "Delivery for {$orderNum} archived.");
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    public function restore(Delivery $delivery): RedirectResponse
    {
        $delivery->restore();

        $orderNum = $delivery->order?->order_number ?? 'delivery';
        return back()->with('success', "Delivery for {$orderNum} restored.");
    }

    // ── Force Delete ──────────────────────────────────────────────────────────

    public function forceDestroy(Delivery $delivery): RedirectResponse
    {
        $orderNum = $delivery->order?->order_number ?? 'delivery';
        $delivery->forceDelete();

        return back()->with('success', "Delivery for {$orderNum} permanently deleted.");
    }

    // ── Unassign (remove assigned delivery) ───────────────────────────────────

    public function unassign(Delivery $delivery): RedirectResponse
    {
        if ($delivery->status !== 'assigned') {
            return back()->with('error', 'Only deliveries with "Assigned" status can be removed.');
        }

        DB::transaction(function () use ($delivery) {
            $delivery->order?->update(['status' => 'preparing']);
            $delivery->delete();
        });

        return back()->with('success', 'Delivery assignment removed. Order reverted to Preparing.');
    }
}
