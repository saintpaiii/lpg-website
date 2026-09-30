<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Store;
use App\Models\CouponUse;
use App\Models\StoreCoupon;
use App\Services\CouponException;
use App\Services\CouponService;
use App\Services\NotificationService;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class CheckoutController extends Controller
{
    private const PAYMENT_MODE_LABELS = [
        'full'        => 'Full Payment',
        'consignment' => 'Consignment',
        'cod'         => 'Cash on Delivery',
    ];

    private function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $R    = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function calcDeliveryFee(Store $store, float $distKm): float
    {
        $base  = (float) ($store->base_delivery_fee ?? 0);
        $perKm = (float) ($store->fee_per_km ?? 0);
        if ($base <= 0 && $perKm <= 0) {
            return (float) ($store->delivery_fee ?? 0);
        }
        return ceil(($base + $distKm * $perKm) / 5) * 5;
    }

    private function generateOrderNumber(): string
    {
        $year  = date('Y');
        $count = Order::withTrashed()->whereYear('created_at', $year)->count();
        return 'ORD-' . $year . '-' . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    private function downPaymentPercent(Store $store): int
    {
        return max(20, min(80, (int) ($store->min_down_payment_percent ?: 50)));
    }

    /**
     * Build checkout store groups from DB cart_items, filtered to selected product IDs.
     */
    private function buildCheckoutStores(int $userId, array $selectedProductIds, ?Customer $customer): array
    {
        $cartItems = CartItem::with(['product.inventory', 'store'])
            ->where('user_id', $userId)
            ->whereIn('product_id', $selectedProductIds)
            ->get();

        $stores = [];
        foreach ($cartItems as $ci) {
            $product = $ci->product;
            $store   = $ci->store;
            if (! $product || ! $store) {
                continue;
            }

            $storeId = $store->id;
            if (! isset($stores[$storeId])) {
                $stores[$storeId] = [
                    'store_id'               => $storeId,
                    'store_name'             => $store->store_name,
                    'delivery_fee'           => (float) ($store->delivery_fee ?? 0),
                    'store_lat'              => $store->latitude  ? (float) $store->latitude  : null,
                    'store_lng'              => $store->longitude ? (float) $store->longitude : null,
                    'base_delivery_fee'      => $store->base_delivery_fee ? (float) $store->base_delivery_fee : null,
                    'fee_per_km'             => $store->fee_per_km        ? (float) $store->fee_per_km        : null,
                    'max_delivery_radius_km' => $store->max_delivery_radius_km ? (int) $store->max_delivery_radius_km : null,
                    'allow_cod'              => (bool) ($store->allow_cod ?? true),
                    'allow_consignment'      => (bool) ($store->allow_consignment ?? true),
                    'min_down_payment_percent' => $this->downPaymentPercent($store),
                    'consignment_due_days'   => (int) ($store->consignment_due_days ?: 7),
                    'coupons'                => $customer
                        ? StoreCoupon::usable()
                            ->where('customer_id', $customer->id)
                            ->where('store_id', $storeId)
                            ->orderBy('expires_at')
                            ->get()
                            ->map(fn (StoreCoupon $c) => [
                                'id'         => $c->id,
                                'code'       => $c->code,
                                'amount'     => (float) $c->amount,
                                'expires_at' => $c->expires_at?->format('M d, Y'),
                            ])->values()->all()
                        : [],
                    'items'                  => [],
                ];
            }

            $stores[$storeId]['items'][] = [
                'product_id'       => $product->id,
                'name'             => $product->name,
                'brand'            => $product->brand ?? '',
                'weight'           => $product->weight ?? (($product->weight_kg ?? '') . 'kg'),
                'image_url'        => $product->image ? Storage::url($product->image) : null,
                'refill_price'     => (float) $product->refill_price,
                'purchase_price'   => (float) ($product->purchase_price ?? $product->refill_price),
                'transaction_type' => $ci->transaction_type,
                'quantity'         => $ci->quantity,
                'stock'            => $product->inventory?->quantity ?? 0,
            ];
        }

        return array_values($stores);
    }

    // ─────────────────────────────────────────────────────────────────────────

    public function index(Request $request): Response|RedirectResponse
    {
        // Block unverified customers from reaching checkout
        if ($request->user()->id_verification_status !== 'verified') {
            return redirect('/customer/cart')
                ->with('error', 'Identity verification required. Please complete your ID verification to place orders.');
        }

        $userId = auth()->id();

        // Accept selected IDs from query string (GET nav from cart page) or fall back to session
        if ($request->has('selected')) {
            $selected = array_map('intval', (array) $request->input('selected', []));
            session(['cart_selected' => $selected]);
        } else {
            $selected = session('cart_selected', []);
        }

        if (empty($selected)) {
            return redirect('/customer/products')->with('error', 'No items selected. Please go back and select items.');
        }

        $customer       = Customer::where('user_id', $userId)->first();
        $checkoutStores = $this->buildCheckoutStores($userId, $selected, $customer);

        if (empty($checkoutStores)) {
            return redirect('/customer/products')->with('error', 'Your cart is empty. Browse products to start shopping.');
        }

        return Inertia::render('customer/checkout', [
            'stores'   => $checkoutStores,
            'customer' => $customer ? [
                'name'     => $customer->name,
                'phone'    => $customer->phone,
                'address'  => $customer->address,
                'city'     => $customer->city,
                'barangay' => $customer->barangay,
                'lat'      => $customer->latitude  ? (float) $customer->latitude  : null,
                'lng'      => $customer->longitude ? (float) $customer->longitude : null,
            ] : null,
        ]);
    }

    /**
     * Validate a promo code against the current checkout selection.
     * Returns the coupon rules so the page can recompute the discount live.
     */
    public function applyCoupon(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:40']);

        $selected = array_map('intval', (array) session('cart_selected', []));
        $items    = CartItem::with('product')
            ->where('user_id', auth()->id())
            ->whereIn('product_id', $selected)
            ->get();

        if ($items->isEmpty()) {
            return response()->json(['error' => 'Your checkout is empty.'], 422);
        }

        // store_id => items total, priced the same way as store()
        $productTotals = [];
        foreach ($items as $ci) {
            if (! $ci->product) continue;
            $price = ($ci->transaction_type ?? 'refill') === 'refill'
                ? (float) $ci->product->refill_price
                : (float) ($ci->product->purchase_price ?? $ci->product->refill_price);
            $productTotals[$ci->store_id] = ($productTotals[$ci->store_id] ?? 0) + $price * $ci->quantity;
        }

        try {
            $coupon = CouponService::validate($data['code'], $request->user()->id, $productTotals);
        } catch (CouponException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json(['coupon' => CouponService::toClient($coupon)]);
    }

    public function store(Request $request): RedirectResponse|JsonResponse
    {
        $isJson = str_contains($request->header('Content-Type', ''), 'application/json');

        $error = function (string $msg, int $status = 422) use ($isJson, $request) {
            if ($isJson) {
                return response()->json(['error' => $msg], $status);
            }
            return back()->with('error', $msg);
        };

        try {
            $selected = array_map('intval', (array) session('cart_selected', []));

            if (empty($selected)) {
                return $error('No items selected. Please go back to the cart and select items.');
            }

            // Block unverified customers (also enforced in index(), but guard store() too)
            if (auth()->user()->id_verification_status !== 'verified') {
                return $error('Identity verification required. Please complete your ID verification to place orders.', 403);
            }

            $customer = Customer::where('user_id', auth()->id())->first();
            if (! $customer) {
                return $error('Customer profile not found. Please complete your profile first.');
            }

            $data = $request->validate([
                'payment_mode'               => 'required|in:full,consignment,cod',
                'coupon_ids'                 => 'nullable|array',
                'coupon_ids.*'               => 'integer',
                'coupon_code'                => 'nullable|string|max:40',
                'notes'                      => 'nullable|string|max:1000',
                'delivery_latitude'          => 'nullable|numeric|between:-90,90',
                'delivery_longitude'         => 'nullable|numeric|between:-180,180',
                'estimated_delivery_minutes' => 'nullable|integer|min:0|max:9999',
            ]);

            $deliveryLat  = isset($data['delivery_latitude'])  ? (float) $data['delivery_latitude']  : null;
            $deliveryLng  = isset($data['delivery_longitude']) ? (float) $data['delivery_longitude'] : null;
            $estimatedMin = isset($data['estimated_delivery_minutes']) ? (int) $data['estimated_delivery_minutes'] : null;

            $paymentMode = $data['payment_mode'];
            $couponIds   = array_map('intval', $data['coupon_ids'] ?? []);
            $couponCode  = trim((string) ($data['coupon_code'] ?? '')) ?: null;

            // Read selected items from DB cart
            $cartItems = CartItem::with(['product.inventory', 'store'])
                ->where('user_id', auth()->id())
                ->whereIn('product_id', $selected)
                ->get();

            if ($cartItems->isEmpty()) {
                return $error('No cart items found. Please go back and add items to your cart.');
            }

            // Group by store for order creation
            $checkoutStores = [];
            foreach ($cartItems as $ci) {
                $storeId = $ci->store_id;
                if (! isset($checkoutStores[$storeId])) {
                    $checkoutStores[$storeId] = [
                        'store_id'     => $storeId,
                        'store_name'   => $ci->store?->store_name ?? 'Unknown Store',
                        'delivery_fee' => (float) ($ci->store?->delivery_fee ?? 0),
                        'store_ref'    => $ci->store,
                        'items'        => [],
                    ];
                }
                $checkoutStores[$storeId]['items'][] = [
                    'product_id'       => $ci->product_id,
                    'name'             => $ci->product?->name ?? 'Product',
                    'quantity'         => $ci->quantity,
                    'transaction_type' => $ci->transaction_type,
                ];
            }
            $checkoutStores = array_values($checkoutStores);

            // Block checkout if any selected items are from the user's own store
            $ownStoreId = Store::where('user_id', auth()->id())->value('id');
            if ($ownStoreId) {
                foreach ($checkoutStores as $storeData) {
                    if ((int) $storeData['store_id'] === (int) $ownStoreId) {
                        return $error('You cannot place an order from your own store.');
                    }
                }
            }

            // Every store in this checkout must accept the chosen payment method
            foreach ($checkoutStores as $storeData) {
                $s = $storeData['store_ref'];
                if ($paymentMode === 'cod' && $s && ! $s->allow_cod) {
                    return $error("{$s->store_name} does not accept Cash on Delivery.");
                }
                if ($paymentMode === 'consignment' && $s && ! $s->allow_consignment) {
                    return $error("{$s->store_name} does not offer Consignment.");
                }
            }

            // Create one order per store in a single DB transaction
            $orders = DB::transaction(function () use ($checkoutStores, $customer, $request, $data, $paymentMode, $couponIds, $couponCode, $deliveryLat, $deliveryLng, $estimatedMin) {
                // ── Pass 1: price every store's items and delivery fee ─────────
                $prepared = [];

                foreach ($checkoutStores as $storeData) {
                    $store = Store::where('id', $storeData['store_id'])
                        ->visibleToCustomers()
                        ->first();

                    if (! $store) {
                        throw new \RuntimeException("Store '{$storeData['store_name']}' is no longer available.");
                    }

                    $subtotal     = 0;
                    $orderedItems = [];
                    $transTypes   = [];

                    foreach ($storeData['items'] as $cartItem) {
                        $product = Product::with('inventory')
                            ->where('id', $cartItem['product_id'])
                            ->where('is_active', true)
                            ->first();

                        if (! $product || $product->store_id !== $store->id) {
                            throw new \RuntimeException("Product '{$cartItem['name']}' is no longer available.");
                        }

                        $stock = $product->inventory?->quantity ?? 0;
                        if ($stock < $cartItem['quantity']) {
                            throw new \RuntimeException("Insufficient stock for {$product->name}. Only {$stock} unit(s) left.");
                        }

                        $txType = $cartItem['transaction_type'] ?? 'refill';
                        $price  = $txType === 'refill'
                            ? (float) $product->refill_price
                            : (float) ($product->purchase_price ?? $product->refill_price);
                        $sub    = $price * $cartItem['quantity'];

                        $subtotal      += $sub;
                        $transTypes[]   = $txType;
                        $orderedItems[] = [
                            'product'    => $product,
                            'quantity'   => $cartItem['quantity'],
                            'unit_price' => $price,
                            'subtotal'   => $sub,
                        ];
                    }

                    $txTypeFinal = (array_count_values($transTypes)['refill'] ?? 0) >= (array_count_values($transTypes)['new_purchase'] ?? 0)
                        ? 'refill' : 'new_purchase';

                    // Calculate delivery fee (dynamic if store has lat/lng + fee settings + customer dropped a pin)
                    $distKm      = null;
                    $finalFee    = (float) ($storeData['delivery_fee'] ?? 0);
                    if ($deliveryLat !== null && $deliveryLng !== null
                        && $store->latitude && $store->longitude) {
                        $distKm   = $this->haversineKm((float) $store->latitude, (float) $store->longitude, $deliveryLat, $deliveryLng);
                        $finalFee = $this->calcDeliveryFee($store, $distKm);
                    }

                    // Store discount coupon (issued by this store as a refund resolution)
                    $storeCoupon = null;
                    $discount    = 0.0;
                    if ($couponIds) {
                        $storeCoupon = StoreCoupon::usable()
                            ->whereIn('id', $couponIds)
                            ->where('customer_id', $customer->id)
                            ->where('store_id', $store->id)
                            ->lockForUpdate()
                            ->first();
                        if ($storeCoupon) {
                            $discount = min((float) $storeCoupon->amount, $subtotal);
                        }
                    }

                    $prepared[$store->id] = compact('store', 'subtotal', 'orderedItems', 'txTypeFinal', 'distKm', 'finalFee', 'storeCoupon', 'discount');
                }

                // ── Promo coupon (platform or store) — validated under a row lock ──
                $promo       = null;
                $allocations = [];
                if ($couponCode) {
                    $promo = CouponService::validate(
                        $couponCode,
                        $request->user()->id,
                        array_map(fn ($p) => (float) $p['subtotal'], $prepared),
                        lock: true,
                    );
                    $allocations = CouponService::allocate($promo, array_map(fn ($p) => [
                        'product'  => round($p['subtotal'] - $p['discount'], 2),
                        'shipping' => (float) $p['finalFee'],
                    ], $prepared));

                    if (array_sum(array_column($allocations, 'total')) <= 0) {
                        throw new CouponException("Coupon {$promo->code} doesn't reduce this order.");
                    }
                }

                // ── Pass 2: create the orders ─────────────────────────────────
                $createdOrders = [];

                foreach ($prepared as $storeId => $p) {
                    $store       = $p['store'];
                    $promoCut    = $allocations[$storeId] ?? ['product' => 0.0, 'shipping' => 0.0, 'total' => 0.0];
                    $totalAmount = round($p['subtotal'] - $p['discount'] - $promoCut['product'], 2);
                    $shippingFee = round($p['finalFee'] - $promoCut['shipping'], 2);
                    $grandTotal  = round($totalAmount + $shippingFee, 2);

                    // Consignment: store-defined minimum down payment now, balance after delivery
                    $downPayment      = null;
                    $remainingBalance = null;
                    if ($paymentMode === 'consignment') {
                        $downPayment      = round($grandTotal * $this->downPaymentPercent($store) / 100, 2);
                        $remainingBalance = round($grandTotal - $downPayment, 2);
                    }

                    $order = Order::create([
                        'order_number'               => $this->generateOrderNumber(),
                        'customer_id'                => $customer->id,
                        'store_id'                   => $store->id,
                        'transaction_type'           => $p['txTypeFinal'],
                        'status'                     => 'pending',
                        'total_amount'               => $totalAmount,
                        'shipping_fee'               => $shippingFee,
                        'discount_amount'            => $p['discount'],
                        'coupon_id'                  => $promoCut['total'] > 0 ? $promo->id : null,
                        'coupon_discount'            => $promoCut['total'],
                        'payment_method'             => $paymentMode === 'cod' ? 'cash' : null,
                        'payment_status'             => 'unpaid',
                        'payment_mode'               => $paymentMode,
                        'down_payment_amount'        => $downPayment,
                        'remaining_balance'          => $remainingBalance,
                        'notes'                      => $data['notes'] ?? null,
                        'ordered_at'                 => now(),
                        'created_by'                 => $request->user()->id,
                        'delivery_latitude'          => $deliveryLat,
                        'delivery_longitude'         => $deliveryLng,
                        'delivery_distance_km'       => $p['distKm'] !== null ? round($p['distKm'], 2) : null,
                        'estimated_delivery_minutes' => $estimatedMin,
                    ]);

                    foreach ($p['orderedItems'] as $item) {
                        OrderItem::create([
                            'order_id'   => $order->id,
                            'product_id' => $item['product']->id,
                            'quantity'   => $item['quantity'],
                            'unit_price' => $item['unit_price'],
                            'subtotal'   => $item['subtotal'],
                        ]);
                    }

                    if ($p['storeCoupon']) {
                        $p['storeCoupon']->update([
                            'status'        => 'used',
                            'used_order_id' => $order->id,
                            'used_at'       => now(),
                        ]);
                    }

                    $createdOrders[] = [
                        'order'        => $order,
                        'store'        => $store,
                        'delivery_fee' => $shippingFee,
                        'discount'     => round($p['discount'] + $promoCut['total'], 2),
                        // Amount collected online right now
                        'pay_now'      => match ($paymentMode) {
                            'consignment' => $downPayment,
                            'cod'         => 0.0,
                            default       => $grandTotal,
                        },
                    ];
                }

                // One coupon_uses row per discounted order (who pays + agreed commission rate),
                // grouped by checkout_ref so a multi-store checkout counts as a single use.
                if ($promo) {
                    $checkoutRef = (string) \Illuminate\Support\Str::uuid();
                    foreach ($createdOrders as $entry) {
                        $cut = (float) $entry['order']->coupon_discount;
                        if ($cut <= 0) {
                            continue;
                        }
                        $split      = CouponService::split($promo, $cut);
                        $normalRate = (float) ($entry['store']->commission_rate ?: \App\Models\Commission::DEFAULT_RATE);
                        CouponUse::create([
                            'coupon_id'        => $promo->id,
                            'user_id'          => $request->user()->id,
                            'order_id'         => $entry['order']->id,
                            'discount_applied' => $cut,
                            'admin_absorbed'   => $split['admin'],
                            'seller_absorbed'  => $split['seller'],
                            'commission_rate'  => CouponService::promoCommissionRate($promo, $normalRate),
                            'checkout_ref'     => $checkoutRef,
                        ]);
                    }
                    $promo->increment('used_count');
                }

                return $createdOrders;
            });

            // Remove ordered items from DB cart (leave unselected items intact)
            CartItem::where('user_id', auth()->id())
                ->whereIn('product_id', $selected)
                ->delete();
            session()->forget('cart_selected');

            // Notify each store owner (and their staff) about the new order
            $modeLabel = self::PAYMENT_MODE_LABELS[$paymentMode];
            foreach ($orders as $entry) {
                $ord   = $entry['order'];
                $store = $entry['store'];
                NotificationService::sendToStore(
                    $store->id,
                    'order_update',
                    'New Order Received',
                    "Order #{$ord->order_number} has been placed ({$modeLabel}). Total: ₱" . number_format($ord->grandTotal(), 2),
                    ['order_id' => $ord->id, 'link' => '/seller/orders/' . $ord->id]
                );
            }

            // Orders fully covered by a store coupon need no online payment
            foreach ($orders as $entry) {
                if ($paymentMode === 'full' && $entry['pay_now'] <= 0) {
                    $entry['order']->update(['payment_status' => 'paid']);
                }
            }

            // Cash on Delivery — rider collects cash, no PayMongo session
            $toCharge = array_values(array_filter($orders, fn ($e) => $e['pay_now'] > 0));
            if ($paymentMode === 'cod' || empty($toCharge)) {
                return response()->json(['redirect_url' => url('/customer/orders?placed=' . ($paymentMode === 'cod' ? 'cod' : '1'))]);
            }

            $paymongo  = app(PayMongoService::class);
            $user      = $request->user();
            $lineItems = [];

            foreach ($toCharge as $entry) {
                $order = $entry['order'];
                $store = $entry['store'];
                $order->load('items.product');

                if ($paymentMode === 'consignment') {
                    $pct = $this->downPaymentPercent($store);
                    $lineItems[] = [
                        'name'        => "Down Payment — {$store->store_name}",
                        'description' => "{$pct}% consignment down payment for Order {$order->order_number}",
                        'amount'      => (int) round($entry['pay_now'] * 100),
                        'currency'    => 'PHP',
                        'quantity'    => 1,
                    ];
                } elseif ($entry['discount'] > 0) {
                    // Discounted order: charge a single line so the total matches exactly
                    $lineItems[] = [
                        'name'        => "Order {$order->order_number} — {$store->store_name}",
                        'description' => 'Items + delivery fee, less ₱' . number_format($entry['discount'], 2) . ' discount',
                        'amount'      => (int) round($entry['pay_now'] * 100),
                        'currency'    => 'PHP',
                        'quantity'    => 1,
                    ];
                } else {
                    // Full payment: line items per product
                    foreach ($order->items as $item) {
                        $lineItems[] = [
                            'name'        => $item->product?->name ?? 'LPG Product',
                            'description' => ($item->product?->brand ?? '') . ' — ' . $store->store_name,
                            'amount'      => (int) round((float) $item->unit_price * 100),
                            'currency'    => 'PHP',
                            'quantity'    => $item->quantity,
                        ];
                    }
                    if ((float) $entry['delivery_fee'] > 0) {
                        $lineItems[] = [
                            'name'        => 'Delivery Fee',
                            'description' => $store->store_name,
                            'amount'      => (int) round((float) $entry['delivery_fee'] * 100),
                            'currency'    => 'PHP',
                            'quantity'    => 1,
                        ];
                    }
                }
            }

            $firstOrder = $toCharge[0]['order'];
            $storeNames = implode(', ', array_map(fn ($e) => $e['store']->store_name, $toCharge));

            $session = $paymongo->createCheckoutSession([
                'reference_number' => $firstOrder->order_number,
                'description'      => $paymentMode === 'consignment'
                    ? "Consignment Down Payment — Order {$firstOrder->order_number}"
                    : (count($toCharge) > 1
                        ? 'LPG Orders from ' . $storeNames
                        : "LPG Order {$firstOrder->order_number} from {$toCharge[0]['store']->store_name}"),
                'line_items'       => $lineItems,
                'success_url'      => url('/customer/orders?payment=success'),
                'cancel_url'       => url('/customer/orders?payment=cancelled'),
                'customer_name'    => $user->name,
                'customer_email'   => $user->email,
                'customer_phone'   => $user->phone ?? '',
            ]);

            if (empty($session['checkout_url'])) {
                throw new \RuntimeException('PayMongo did not return a checkout URL.');
            }

            // One Payment record per order
            foreach ($toCharge as $entry) {
                Payment::create([
                    'order_id'             => $entry['order']->id,
                    'paymongo_checkout_id' => $session['id'],
                    'amount'               => round($entry['pay_now'], 2),
                    'status'               => 'pending',
                ]);
            }

            return response()->json(['checkout_url' => $session['checkout_url']]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (CouponException $e) {
            return $error($e->getMessage());
        } catch (\Throwable $e) {
            Log::error('Checkout store() error: ' . $e->getMessage(), [
                'user_id' => auth()->id(),
                'file'    => $e->getFile(),
                'line'    => $e->getLine(),
            ]);
            $msg = app()->isLocal() ? $e->getMessage() : 'Checkout failed. Please try again or use Cash on Delivery.';
            if ($isJson) {
                return response()->json(['error' => $msg], 422);
            }
            return back()->with('error', $msg);
        }
    }
}
