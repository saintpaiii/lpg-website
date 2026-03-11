<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'order' => $d->order ? [
                'id'           => $d->order->id,
                'order_number' => $d->order->order_number,
                'status'       => $d->order->status,
                'total_amount' => (float) $d->order->total_amount,
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

        $query = Delivery::with(['order.customer', 'order.items.product'])
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
        ]);
    }

    // ── Update Status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Delivery $delivery): RedirectResponse
    {
        // Ensure rider owns this delivery
        if ($delivery->rider_id !== auth()->id()) {
            abort(403, 'Unauthorized.');
        }

        $data = $request->validate([
            'status' => 'required|in:picked_up,in_transit,delivered,failed',
            'notes'  => 'nullable|string|max:500',
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

        $label = ucfirst(str_replace('_', ' ', $newStatus));
        return back()->with('success', "Delivery marked as {$label}.");
    }
}
