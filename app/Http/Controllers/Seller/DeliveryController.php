<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
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

        $query = Delivery::with(['order.customer', 'rider', 'proofs'])
            ->where('store_id', $store->id);

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

        $deliveries = $query->latest()->paginate(20)->withQueryString()
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
                'rider'  => $d->rider ? ['id' => $d->rider->id, 'name' => $d->rider->name, 'phone' => $d->rider->phone] : null,
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
            'unassigned' => $unassigned,
            'counts'     => $counts,
            'tab'        => $tab,
            'search'     => $search ?? '',
        ]);
    }

    public function assign(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'order_id' => 'required|exists:orders,id',
            'rider_id' => 'required|exists:users,id',
        ]);

        $order = Order::where('id', $data['order_id'])->where('store_id', $store->id)->firstOrFail();
        $rider = User::where('id', $data['rider_id'])->where('store_id', $store->id)->firstOrFail();

        if ($order->delivery) {
            $order->delivery->update(['rider_id' => $rider->id, 'assigned_at' => now(), 'status' => 'assigned']);
        } else {
            Delivery::create([
                'order_id'    => $order->id,
                'store_id'    => $store->id,
                'rider_id'    => $rider->id,
                'status'      => 'assigned',
                'assigned_at' => now(),
            ]);
        }

        $order->update(['status' => 'out_for_delivery']);

        return back()->with('success', "Delivery assigned to {$rider->name}.");
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
        } elseif ($data['status'] === 'failed') {
            $delivery->order->update(['status' => 'preparing']);
        }

        return back()->with('success', 'Delivery status updated.');
    }
}
