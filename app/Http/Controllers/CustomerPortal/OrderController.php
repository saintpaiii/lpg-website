<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Invoice;
use App\Models\Order;
use Illuminate\Support\Facades\Storage;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Rating;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    private function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $R    = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a    = sin($dLat / 2) ** 2
              + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    private function generateOrderNumber(): string
    {
        $year   = date('Y');
        $prefix = "ORD-{$year}-";
        $count  = Order::withTrashed()->whereYear('created_at', $year)->count();
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    private function generateInvoiceNumber(): string
    {
        $year   = date('Y');
        $prefix = "INV-{$year}-";
        $count  = Invoice::withTrashed()->whereYear('created_at', $year)->count();
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
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

        $orders = collect();
        if ($customer) {
            $ordersQuery = $customer->orders()->with(['items.product', 'invoice', 'store'])->orderByDesc('created_at');
            if ($dateFrom)     $ordersQuery->whereDate('created_at', '>=', $dateFrom);
            if ($dateTo)       $ordersQuery->whereDate('created_at', '<=', $dateTo);
            if ($statusFilter) $ordersQuery->where('status', $statusFilter);

            $orders = $ordersQuery
                ->paginate(15)
                ->withQueryString()
                ->through(fn ($o) => [
                    'id'             => $o->id,
                    'order_number'   => $o->order_number,
                    'store_name'     => $o->store?->store_name ?? '—',
                    'status'         => $o->status,
                    'total_amount'   => (float) $o->total_amount,
                    'payment_method' => $o->payment_method,
                    'payment_status' => $o->payment_status,
                    'created_at'     => $o->created_at->format('M d, Y'),
                    'items_count'    => $o->items->count(),
                    'items_summary'  => $o->items->map(fn ($i) => $i->product?->name)->filter()->implode(', '),
                    'invoice_id'     => $o->invoice?->id,
                    'cancelled_by'   => $o->cancelled_by,
                ]);
        }

        return Inertia::render('customer/orders', [
            'orders'    => $orders,
            'date_from' => $request->get('date_from') ?: '',
            'date_to'   => $request->get('date_to')   ?: '',
            'status'    => $request->get('status') ?: '',
        ]);
    }

    public function create(Request $request): Response
    {
        $products = Product::where('is_active', true)
            ->with('inventory')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id'            => $p->id,
                'name'          => $p->name,
                'brand'         => $p->brand,
                'weight_kg'     => (float) $p->weight_kg,
                'selling_price' => (float) $p->selling_price,
                'stock'         => $p->inventory?->quantity ?? 0,
            ]);

        $customer = $this->getCustomer($request);

        // Grab the first approved store for delivery fee settings
        $store = \App\Models\Store::where('status', 'approved')->first();

        return Inertia::render('customer/order-create', [
            'products' => $products,
            'defaultAddress' => $customer ? [
                'address'  => $customer->address,
                'city'     => $customer->city,
                'barangay' => $customer->barangay,
                'lat'      => $customer->lat ? (float) $customer->lat : null,
                'lng'      => $customer->lng ? (float) $customer->lng : null,
            ] : null,
            'storeDelivery' => $store ? [
                'latitude'               => $store->latitude ? (float) $store->latitude : null,
                'longitude'              => $store->longitude ? (float) $store->longitude : null,
                'base_delivery_fee'      => (float) ($store->base_delivery_fee ?? 45),
                'fee_per_km'             => (float) ($store->fee_per_km ?? 10),
                'max_delivery_radius_km' => (int) ($store->max_delivery_radius_km ?? 20),
            ] : null,
        ]);
    }

    public function store(Request $request): RedirectResponse|JsonResponse
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return back()->withErrors(['general' => 'Customer profile not found.']);
        }

        $data = $request->validate([
            'transaction_type'    => 'required|in:refill,new_purchase',
            'payment_type'        => 'required|in:cod,online',
            'notes'               => 'nullable|string|max:1000',
            'delivery_latitude'          => 'nullable|numeric|between:-90,90',
            'delivery_longitude'         => 'nullable|numeric|between:-180,180',
            'delivery_distance_km'       => 'nullable|numeric|min:0|max:999',
            'estimated_delivery_minutes' => 'nullable|integer|min:0|max:9999',
            'items'               => 'required|array|min:1',
            'items.*.product_id'  => 'required|exists:products,id',
            'items.*.quantity'    => 'required|integer|min:1',
        ]);

        $isCod = $data['payment_type'] === 'cod';

        // ── Delivery fee calculation ──────────────────────────────────────────
        $deliveryFee = 0;
        $deliveryLat = isset($data['delivery_latitude'])  ? (float) $data['delivery_latitude']  : null;
        $deliveryLng = isset($data['delivery_longitude']) ? (float) $data['delivery_longitude'] : null;

        $store = \App\Models\Store::where('status', 'approved')->first();

        if ($store && $deliveryLat !== null && $deliveryLng !== null && $store->latitude && $store->longitude) {
            $distKm = $this->haversineKm(
                (float) $store->latitude, (float) $store->longitude,
                $deliveryLat, $deliveryLng
            );

            $maxKm = (int) ($store->max_delivery_radius_km ?? 20);
            if ($distKm > $maxKm) {
                $msg = sprintf(
                    'This store does not deliver to your area (%.1f km away, max %d km).',
                    $distKm, $maxKm
                );
                if ($request->expectsJson()) {
                    return response()->json(['error' => $msg], 422);
                }
                return back()->withErrors(['delivery_latitude' => $msg]);
            }

            $base    = (float) ($store->base_delivery_fee ?? 45);
            $perKm   = (float) ($store->fee_per_km ?? 10);
            $raw     = $base + $distKm * $perKm;
            $deliveryFee = (int) (ceil($raw / 5) * 5); // round up to nearest ₱5
        } elseif ($store) {
            // No customer location — use base fee only
            $deliveryFee = (float) ($store->base_delivery_fee ?? 45);
        }

        $deliveryDistKm = isset($data['delivery_distance_km']) ? (float) $data['delivery_distance_km'] : null;
        $estimatedMins  = isset($data['estimated_delivery_minutes']) ? (int) $data['estimated_delivery_minutes'] : null;

        $order = DB::transaction(function () use ($data, $customer, $request, $isCod, $deliveryFee, $deliveryLat, $deliveryLng, $deliveryDistKm, $estimatedMins) {
            $productsTotal = 0;
            $itemsData     = [];

            foreach ($data['items'] as $item) {
                $product        = Product::findOrFail($item['product_id']);
                $subtotal       = $product->selling_price * $item['quantity'];
                $productsTotal += $subtotal;
                $itemsData[]    = [
                    'product_id' => $product->id,
                    'quantity'   => $item['quantity'],
                    'unit_price' => $product->selling_price,
                    'subtotal'   => $subtotal,
                ];
            }

            $totalAmount = $productsTotal + $deliveryFee;

            $order = Order::create([
                'order_number'       => $this->generateOrderNumber(),
                'customer_id'        => $customer->id,
                'transaction_type'   => $data['transaction_type'],
                'status'             => 'pending',
                'total_amount'       => $totalAmount,
                'shipping_fee'       => $deliveryFee > 0 ? $deliveryFee : null,
                'payment_method'     => $isCod ? 'cash' : null,
                'payment_status'     => 'unpaid',
                'notes'              => $data['notes'] ?? null,
                'ordered_at'         => now(),
                'created_by'         => $request->user()->id,
                'delivery_latitude'           => $deliveryLat,
                'delivery_longitude'          => $deliveryLng,
                'delivery_distance_km'        => $deliveryDistKm,
                'estimated_delivery_minutes'  => $estimatedMins,
            ]);

            foreach ($itemsData as $item) {
                OrderItem::create(array_merge(['order_id' => $order->id], $item));
            }

            return $order;
        });

        // COD: done
        if ($isCod) {
            return redirect()->route('customer.orders')->with('success', 'Order placed! We will confirm it shortly.');
        }

        // Online payment: create PayMongo checkout session
        try {
            $paymongo    = app(PayMongoService::class);
            $user        = $request->user();
            $lineItems   = [];

            $order->load('items.product');
            foreach ($order->items as $item) {
                $lineItems[] = [
                    'name'        => $item->product?->name ?? 'LPG Product',
                    'description' => $item->product?->brand ?? '',
                    'amount'      => (int) round((float) $item->unit_price * 100), // centavos
                    'currency'    => 'PHP',
                    'quantity'    => $item->quantity,
                ];
            }
            // Add delivery fee as a line item if applicable
            if ($order->shipping_fee && (float) $order->shipping_fee > 0) {
                $lineItems[] = [
                    'name'        => 'Delivery Fee',
                    'description' => 'Distance-based delivery fee',
                    'amount'      => (int) round((float) $order->shipping_fee * 100),
                    'currency'    => 'PHP',
                    'quantity'    => 1,
                ];
            }

            $session = $paymongo->createCheckoutSession([
                'reference_number' => $order->order_number,
                'description'      => "LPG Order {$order->order_number}",
                'line_items'       => $lineItems,
                'success_url'      => url("/customer/orders/{$order->id}?payment=success"),
                'cancel_url'       => url("/customer/orders/{$order->id}?payment=cancelled"),
                'customer_name'    => $user->name,
                'customer_email'   => $user->email,
                'customer_phone'   => $user->phone ?? '',
            ]);

            Payment::create([
                'order_id'               => $order->id,
                'paymongo_checkout_id'   => $session['id'],
                'amount'                 => $order->total_amount,
                'status'                 => 'pending',
            ]);

            // Return JSON so the frontend can do a full browser redirect (avoids CORS from Inertia/Axios)
            return response()->json(['checkout_url' => $session['checkout_url']]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Could not start online payment. Please try again or contact support.'], 422);
        }
    }

    // ── Payment verification ──────────────────────────────────────────────────

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

            $payment->update([
                'status'              => 'paid',
                'paymongo_payment_id' => $paymongoPayId,
                'payment_method'      => $localMethod,
                'paid_at'             => now(),
            ]);

            $order->update([
                'payment_status' => 'paid',
                'payment_method' => $localMethod,
            ]);

            if ($order->invoice) {
                $order->invoice->update([
                    'payment_status' => 'paid',
                    'paid_amount'    => $order->total_amount,
                    'paid_at'        => now(),
                    'payment_method' => $localMethod,
                ]);
            }

            return ['status' => 'paid', 'message' => 'Payment confirmed! Your order has been updated.'];
        } catch (\Throwable $e) {
            return ['status' => 'error', 'message' => 'Could not verify payment. Please try again.'];
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

        DB::transaction(function () use ($order, $data, $request) {
            // Restore stock if order was already confirmed (stock was deducted)
            if ($order->status === 'confirmed') {
                $order->load('items');
                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    if ($inventory) {
                        $inventory->increment('quantity', $item->quantity);
                        InventoryTransaction::create([
                            'product_id' => $item->product_id,
                            'type'       => 'cancelled',
                            'quantity'   => $item->quantity,
                            'reference'  => $order->order_number,
                            'notes'      => 'Order cancelled by customer — stock restored',
                            'user_id'    => $request->user()->id,
                        ]);
                    }
                }
            }

            $cancelUpdates = [
                'status'              => 'cancelled',
                'cancellation_reason' => $data['cancellation_reason'],
                'cancellation_notes'  => $data['cancellation_notes'] ?? null,
                'cancelled_by'        => 'customer',
                'cancelled_at'        => now(),
            ];

            // If already paid, flag for refund instead of leaving as paid
            if ($order->payment_status === 'paid') {
                $cancelUpdates['payment_status'] = 'to_refund';
            }

            $order->update($cancelUpdates);

            // Void invoice if one exists
            if ($order->invoice) {
                $order->invoice->update(['payment_status' => 'voided']);
            }
        });

        return redirect()->route('customer.orders')->with('success', 'Order cancelled successfully.');
    }

    // ── Show ──────────────────────────────────────────────────────────────────

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
            'order' => [
                'id'               => $order->id,
                'order_number'     => $order->order_number,
                'store_name'       => $order->store?->store_name ?? '—',
                'store_location'   => ($order->store?->latitude && $order->store?->longitude) ? [
                    'lat'  => (float) $order->store->latitude,
                    'lng'  => (float) $order->store->longitude,
                    'name' => $order->store->store_name,
                ] : null,
                'status'           => $order->status,
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
                'delivery' => $order->delivery ? [
                    'status'      => $order->delivery->status,
                    'rider_name'  => $order->delivery->rider?->name,
                    'assigned_at' => $order->delivery->assigned_at?->format('M d, Y g:i A'),
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
