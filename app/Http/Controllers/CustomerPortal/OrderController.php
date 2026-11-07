<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Exceptions\PaymentServiceUnavailable;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Order;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Storage;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Rating;
use App\Services\OrderPaymentService;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    public function index(Request $request): Response
    {
        $customer = $this->getCustomer($request);

        // Auto-verify all pending payments when returning from PayMongo success URL
        if ($request->query('payment') === 'success' && $customer) {
            $pendingOrders = Order::where('customer_id', $customer->id)
                ->where('payment_status', 'unpaid')
                ->with(['payments', 'invoice'])
                ->get();

            foreach ($pendingOrders as $pendingOrder) {
                if ($pendingOrder->payments->where('status', 'pending')->isNotEmpty()) {
                    $this->attemptVerifyPayment($pendingOrder);
                }
            }
        }

        $dateFrom     = $request->get('date_from');
        $dateTo       = $request->get('date_to');
        $statusFilter = $request->get('status');

        $orders = new LengthAwarePaginator([], 0, 15);
        if ($customer) {
            $ordersQuery = $customer->orders()->with(['items.product', 'invoice', 'store'])->orderByDesc('created_at');
            if ($dateFrom)     $ordersQuery->whereDate('created_at', '>=', $dateFrom);
            if ($dateTo)       $ordersQuery->whereDate('created_at', '<=', $dateTo);
            if ($statusFilter) $ordersQuery->where('status', $statusFilter);

            $orders = $ordersQuery
                ->paginate(15)
                ->withQueryString()
                ->through(fn ($o) => [
                    'id'                => $o->id,
                    'order_number'      => $o->order_number,
                    'store_name'        => $o->store?->store_name ?? '—',
                    'status'            => $o->status,
                    'fulfillment'       => $o->fulfillment ?? 'delivery',
                    'total_amount'      => (float) $o->total_amount,
                    'payment_method'    => $o->payment_method,
                    'payment_status'    => $o->payment_status,
                    'payment_mode'      => $o->payment_mode ?? 'full',
                    'remaining_balance' => $o->remaining_balance ? (float) $o->remaining_balance : null,
                    'balance_due_date'  => $o->balance_due_date?->format('M d, Y'),
                    'is_overdue'        => $o->isBalanceOverdue(),
                    'created_at'        => $o->created_at->format('M d, Y'),
                    'items_count'       => $o->items->count(),
                    'items_summary'     => $o->items->map(fn ($i) => $i->product?->name)->filter()->implode(', '),
                    'invoice_id'        => $o->invoice?->id,
                    'cancelled_by'      => $o->cancelled_by,
                    'seen'              => \App\Services\SectionVisitService::flagsFor($request, $o),
                ]);
        }

        return Inertia::render('customer/orders', [
            'orders'    => $orders,
            'date_from' => $request->get('date_from') ?: '',
            'date_to'   => $request->get('date_to')   ?: '',
            'status'    => $request->get('status') ?: '',
            'since'     => \App\Services\SectionVisitService::sinceIso($request),
        ]);
    }

    /**
     * Pull the latest status from PayMongo for the most-recent pending Payment on this order.
     * Updates Payment, Order, and Invoice if confirmed paid.
     *
     * @return array{status: string, message: string}
     */
    private function attemptVerifyPayment(Order $order): array
    {
        $payment = $order->payments()
            ->where('status', 'pending')
            ->orderByDesc('created_at')
            ->first();

        if (! $payment) {
            return ['status' => 'no_payment', 'message' => 'No pending payment found.'];
        }

        try {
            $paymongo = app(PayMongoService::class);
            $session  = $paymongo->retrieveCheckoutSession($payment->paymongo_checkout_id);
            $attrs    = $session['attributes'] ?? [];
            $payments = $attrs['payments'] ?? [];

            if (empty($payments)) {
                return ['status' => 'pending', 'message' => 'Payment is still being processed. Please wait a moment.'];
            }

            $first          = $payments[0];
            $payStatus      = $first['attributes']['status'] ?? null;
            $paymongoMethod = $first['attributes']['source']['type'] ?? null;
            $paymongoPayId  = $first['id'] ?? null;

            if ($payStatus !== 'paid') {
                return ['status' => 'pending', 'message' => 'Payment is still being processed. Please wait a moment.'];
            }

            $localMethod = PayMongoService::mapPaymentMethod($paymongoMethod ?? '');

            $wasPartial = $order->payment_status === 'partial';
            // Locked + re-checked: when the webhook got there first this does nothing (null)
            $newStatus  = OrderPaymentService::applyPaidCheckoutRow($payment->id, $localMethod, $paymongoPayId);
            $order->refresh();
            $newStatus ??= $order->payment_status;

            if ($order->status === 'cancelled') {
                return ['status' => 'paid', 'message' => 'Payment received, but this order was cancelled. The store will refund you.'];
            }

            if ($newStatus === 'partial') {
                return ['status' => 'partial', 'message' => 'Down payment confirmed! The remaining balance is due after delivery.'];
            }

            return $wasPartial
                ? ['status' => 'paid', 'message' => 'Balance payment confirmed! Your order is fully paid.']
                : ['status' => 'paid', 'message' => 'Payment confirmed! Your order has been updated.'];
        } catch (\Throwable $e) {
            Log::warning('Payment verify error: ' . $e->getMessage(), ['user_id' => auth()->id(), 'order_id' => $order->id]);
            return ['status' => 'error', 'message' => PaymentServiceUnavailable::friendlyMessage($e) ?? 'Could not verify payment. Please try again.'];
        }
    }

    /**
     * Manual verify-payment endpoint (called by the "Verify Payment" button).
     */
    public function verifyPayment(Request $request, Order $order): JsonResponse
    {
        $customer = $this->getCustomer($request);

        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        $order->load('payments', 'invoice');
        $result = $this->attemptVerifyPayment($order);

        return response()->json($result);
    }

    // ── Delivery tracking ─────────────────────────────────────────────────────

    /**
     * GET /customer/orders/{order}/tracking — polled every 30s by the tracking card.
     * The rider's position is rounded to 2 decimals (≈1.1 km): customers see an area,
     * never the rider's exact GPS.
     */
    public function getTracking(Request $request, Order $order): JsonResponse
    {
        $customer = $this->getCustomer($request);
        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        $order->load(['delivery.rider', 'store']);
        $delivery = $order->delivery;

        // Pick-up: no rider, no route — just the store
        if ($order->isPickup()) {
            $store = \App\Services\DeliveryRouteService::storeLocation($order->store);

            return response()->json([
                'status'           => match ($order->status) {
                    'delivered'        => 'picked_up',
                    'out_for_delivery' => 'ready_for_pickup',
                    default            => 'not_dispatched',
                },
                'fulfillment'      => 'pickup',
                'rider_name'       => null,
                'rider_area'       => null,
                'delivery_address' => null,
                'store_location'   => $store ? ['lat' => $store['lat'], 'lng' => $store['lng'], 'name' => $order->store?->store_name] : null,
                'stops_before'     => 0,
            ]);
        }

        $status = match (true) {
            $order->status === 'delivered'                          => 'delivered',
            $order->status !== 'out_for_delivery' || ! $delivery    => 'not_dispatched',
            $delivery->status === 'assigned'                        => 'preparing_pickup',
            default                                                 => 'on_the_way',
        };

        $riderArea = null;
        if ($delivery && in_array($status, ['on_the_way', 'preparing_pickup'])) {
            $loc = \App\Models\RiderCurrentLocation::where('user_id', $delivery->rider_id)->first();
            // Ignore stale positions (rider stopped sharing more than 30 minutes ago)
            if ($loc && $loc->updated_at && $loc->updated_at->gt(now()->subMinutes(30))) {
                $riderArea = ['lat' => round($loc->latitude, 2), 'lng' => round($loc->longitude, 2), 'updated_at' => $loc->updated_at->toIso8601String()];
            }
        }

        $stopsBefore = 0;
        if ($delivery?->batch_id && $delivery->sequence) {
            $stopsBefore = \App\Models\Delivery::where('batch_id', $delivery->batch_id)
                ->where('sequence', '<', $delivery->sequence)
                ->whereNotIn('status', ['delivered', 'failed'])
                ->count();
        }

        $store = \App\Services\DeliveryRouteService::storeLocation($order->store);

        return response()->json([
            'status'           => $status,
            'rider_name'       => $delivery?->rider?->name,
            'rider_area'       => $riderArea,
            'delivery_address' => $order->delivery_latitude && $order->delivery_longitude
                ? ['lat' => (float) $order->delivery_latitude, 'lng' => (float) $order->delivery_longitude]
                : null,
            'store_location'   => $store ? ['lat' => $store['lat'], 'lng' => $store['lng'], 'name' => $order->store?->store_name] : null,
            'stops_before'     => $stopsBefore,
        ]);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public function cancel(Request $request, Order $order): RedirectResponse
    {
        $customer = $this->getCustomer($request);

        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        if (! in_array($order->status, ['pending', 'confirmed'])) {
            return back()->with('error', 'This order cannot be cancelled.');
        }

        $data = $request->validate([
            'cancellation_reason' => 'required|string|max:255',
            'cancellation_notes'  => 'nullable|string|max:1000',
        ]);

        \App\Services\OrderCancellationService::cancelByCustomer(
            $order,
            $data['cancellation_reason'],
            $data['cancellation_notes'] ?? null,
            $request->user()->id,
        );

        return redirect()->route('customer.orders')->with('success', 'Order cancelled successfully.');
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    /**
     * Where the pick-up route starts: the customer's default saved address with coordinates, else the first saved
     * address with coordinates (same choice as checkout). Never customers.latitude/longitude (registration pins are
     * unreliable). 'from_approximate' = the address still sits on its barangay centre (auto-created from the profile).
     *
     * @return array{from: ?array{0: float, 1: float}, from_approximate: bool}
     */
    private function pickupStart(int $userId): array
    {
        $address = \App\Models\CustomerAddress::where('user_id', $userId)
            ->orderByDesc('is_default')->orderBy('id')->get()
            ->first(fn ($a) => (float) $a->latitude != 0.0 && (float) $a->longitude != 0.0);
        if (! $address) {
            return ['from' => null, 'from_approximate' => false];
        }
        $centre = \App\Http\Controllers\BarangayCoordinateController::addressPoint($address->city, $address->barangay);
        $approximate = $centre !== null
            && abs((float) $centre[0] - (float) $address->latitude) < 0.00001
            && abs((float) $centre[1] - (float) $address->longitude) < 0.00001;

        return ['from' => [(float) $address->latitude, (float) $address->longitude], 'from_approximate' => $approximate];
    }

    public function show(Request $request, Order $order): Response
    {
        $customer = $this->getCustomer($request);

        // Security: customer can only view their own orders
        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        $order->load(['items.product', 'delivery.rider', 'delivery.proofs', 'invoice', 'payments', 'store']);

        // Auto-verify when returning from PayMongo success URL
        if ($request->query('payment') === 'success' && $order->payment_status !== 'paid') {
            $this->attemptVerifyPayment($order);
            // Refresh model so the response reflects any updates just made
            $order->refresh();
            $order->load(['items.product', 'delivery.rider', 'delivery.proofs', 'invoice', 'payments', 'store']);
        }

        return Inertia::render('customer/order-show', [
            'receipts'  => \App\Services\PaymentReceiptService::listFor($order, 'customer'),
            'breakdown' => $order->priceBreakdown(),
            'order' => [
                'id'               => $order->id,
                'order_number'     => $order->order_number,
                'store_id'         => $order->store_id,
                'store_name'       => $order->store?->store_name ?? '—',
                'store_location'   => ($order->store?->latitude && $order->store?->longitude) ? [
                    'lat'  => (float) $order->store->latitude,
                    'lng'  => (float) $order->store->longitude,
                    'name' => $order->store->store_name,
                ] : null,
                'status'           => $order->status,
                // Pick-up at the store: address, Maps pin and instructions instead of rider tracking
                'fulfillment'      => $order->fulfillment ?? 'delivery',
                'pickup'           => $order->isPickup() ? [
                    'address'      => $order->store?->address,
                    'barangay'     => $order->store?->barangay,
                    'city'         => $order->store?->city,
                    'lat'          => $order->store?->latitude ? (float) $order->store->latitude : null,
                    'lng'          => $order->store?->longitude ? (float) $order->store->longitude : null,
                    'instructions' => $order->store?->pickup_instructions,
                ] + $this->pickupStart($request->user()->id) : null,
                // Refill: empty tanks to hand over
                'empty_tanks_needed'  => $order->needsEmptyTanks() && ! in_array($order->status, ['delivered', 'cancelled'], true),
                'empty_tank_summary'  => (int) $order->empty_tanks_required > 0 ? $order->emptyTankSummary() : null,
                'transaction_type' => $order->transaction_type,
                'total_amount'     => (float) $order->total_amount,
                'shipping_fee'     => $order->shipping_fee ? (float) $order->shipping_fee : null,
                'delivery_latitude'          => $order->delivery_latitude  ? (float) $order->delivery_latitude  : null,
                'delivery_longitude'         => $order->delivery_longitude ? (float) $order->delivery_longitude : null,
                'delivery_distance_km'       => $order->delivery_distance_km       ? (float) $order->delivery_distance_km       : null,
                'estimated_delivery_minutes' => $order->estimated_delivery_minutes ? (int)   $order->estimated_delivery_minutes : null,
                'payment_method'      => $order->payment_method,
                'payment_status'      => $order->payment_status,
                'payment_mode'        => $order->payment_mode ?? 'full',
                'down_payment_amount' => $order->down_payment_amount ? (float) $order->down_payment_amount : null,
                'remaining_balance'   => $order->remaining_balance ? (float) $order->remaining_balance : null,
                'balance_due_date'    => $order->balance_due_date?->format('M d, Y'),
                'balance_days_remaining' => $order->balance_due_date
                    ? (int) now()->startOfDay()->diffInDays($order->balance_due_date, false)
                    : null,
                'is_overdue'          => $order->isBalanceOverdue(),
                'discount_amount'     => (float) ($order->discount_amount ?? 0),
                'coupon_code'         => (float) $order->coupon_discount > 0 ? $order->coupon?->code : null,
                'coupon_discount'     => (float) ($order->coupon_discount ?? 0),
                'refund_request'      => ($r = $order->refundRequests()->latest()->first()) ? [
                    'id'     => $r->id,
                    'status' => $r->status,
                ] : null,
                'notes'                => $order->notes,
                'cancellation_reason'  => $order->cancellation_reason,
                'cancellation_notes'   => $order->cancellation_notes,
                'cancelled_by'         => $order->cancelled_by,
                'cancelled_at'         => $order->cancelled_at?->format('M d, Y g:i A'),
                'ordered_at'           => $order->ordered_at?->format('M d, Y g:i A'),
                'delivered_at'         => $order->delivered_at?->format('M d, Y g:i A'),
                'created_at'           => $order->created_at->format('M d, Y g:i A'),
                'items'            => $order->items->map(fn ($i) => [
                    'id'         => $i->id,
                    'product_id' => $i->product_id,
                    'quantity'   => $i->quantity,
                    'unit_price' => (float) $i->unit_price,
                    'subtotal'   => (float) $i->subtotal,
                    'product'    => $i->product ? [
                        'name'  => $i->product->name,
                        'brand' => $i->product->brand,
                    ] : null,
                ])->values()->all(),
                'rated_product_ids' => Rating::where('order_id', $order->id)
                    ->where('user_id', $request->user()->id)
                    ->pluck('product_id')
                    ->toArray(),
                // The customer's own reviews on this order (Edit within 7 days / Delete any time)
                'my_reviews' => Rating::where('order_id', $order->id)
                    ->where('user_id', $request->user()->id)
                    ->get()
                    ->map(fn (Rating $r) => [
                        ...$r->publicPayload(),
                        'product_id'  => $r->product_id,
                        'photo_paths' => $r->photo_paths ?? [],
                        'created_at'  => $r->created_at->format('M d, Y'),
                        'can_edit'    => $r->canEdit(),
                    ])->values()->all(),
                // Refund window (days after delivery, chosen by the store; snapshot at checkout)
                'refund_window_days' => $order->refundWindowDays(),
                'refund_deadline'    => $order->refundDeadline()?->format('M d, Y'),
                'refund_window_open' => $order->refundWindowOpen(),
                'store_phone'        => $order->store?->phone,
                'delivery' => $order->delivery ? [
                    'id'          => $order->delivery->id,
                    'status'      => $order->delivery->status,
                    'rider_name'  => $order->delivery->rider?->name,
                    'assigned_at' => $order->delivery->assigned_at?->format('M d, Y g:i A'),
                    'fail_info'   => $order->delivery->failInfo(),
                    'proofs'      => $order->delivery->proofs->map(fn ($p) => [
                        'status'        => $p->status,
                        'photo_url'     => $p->photo_path ? Storage::url($p->photo_path) : null,
                        'notes'         => $p->notes,
                        'location_note' => $p->location_note,
                        'created_at'    => $p->created_at->format('M d, Y g:i A'),
                    ])->values()->all(),
                ] : null,
                'invoice' => $order->invoice ? [
                    'id'             => $order->invoice->id,
                    'invoice_number' => $order->invoice->invoice_number,
                    'payment_status' => $order->invoice->payment_status,
                    'paid_amount'    => (float) $order->invoice->paid_amount,
                    'due_date'       => $order->invoice->due_date?->format('M d, Y'),
                ] : null,
                'payment' => $order->payments->sortByDesc('created_at')->first() ? (function ($p) {
                    return [
                        'id'                     => $p->id,
                        'status'                 => $p->status,
                        'paymongo_checkout_id'   => $p->paymongo_checkout_id,
                        'paymongo_payment_id'    => $p->paymongo_payment_id,
                        'payment_method'         => $p->payment_method,
                        'paid_at'                => $p->paid_at?->format('M d, Y g:i A'),
                    ];
                })($order->payments->sortByDesc('created_at')->first()) : null,
            ],
        ]);
    }
}
