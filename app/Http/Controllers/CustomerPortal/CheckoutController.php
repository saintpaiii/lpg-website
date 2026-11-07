<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Rules\InServiceArea;
use App\Exceptions\CheckoutRuleException;
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
use App\Services\DeliveryFeeService;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use App\Services\PayMongoService;
use App\Services\PurchaseLimitService;
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

    private function generateOrderNumber(): string
    {
        $year  = date('Y');
        $count = Order::withTrashed()->whereYear('created_at', $year)->count();
        return 'ORD-' . $year . '-' . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Consignment down payment % for this customer at this store: the loyalty tier
     * rate when the store runs a loyalty program, otherwise the store's default.
     */
    private function downPaymentPercent(Store $store, ?int $userId = null): int
    {
        $tierPercent = $userId ? $this->loyaltyTerms($store->id, $userId)['downpayment_percent'] : null;

        return max(20, min(80, (int) ($tierPercent ?? $store->min_down_payment_percent ?: 50)));
    }

    /** Consignment requires the store to allow it AND a loyalty program the customer qualifies under. */
    private function consignmentAvailable(Store $store, int $userId): bool
    {
        return (bool) ($store->allow_consignment ?? true) && $this->loyaltyTerms($store->id, $userId)['consignment_allowed'];
    }

    /**
     * Loyalty consignment terms, memoized on the current request (not the controller
     * instance, which Laravel may reuse across requests in long-running processes).
     */
    private function loyaltyTerms(int $storeId, int $userId): array
    {
        $attrs = request()->attributes;
        $cache = $attrs->get('loyalty_terms', []);
        $key   = "{$userId}:{$storeId}";

        if (! array_key_exists($key, $cache)) {
            $cache[$key] = LoyaltyService::getConsignmentTerms($storeId, $userId);
            $attrs->set('loyalty_terms', $cache);
        }

        return $cache[$key];
    }

    /**
     * Build checkout store groups from DB cart_items, filtered to selected product IDs.
     */
    private function buildCheckoutStores(int $userId, array $selectedProductIds, ?Customer $customer): array
    {
        $cartItems = CartItem::with(['product.inventory', 'store.vehicles', 'store.deliveryRates'])
            ->where('user_id', $userId)
            ->whereIn('product_id', $selectedProductIds)
            ->get();

        // Bought earlier today / this week, for products limited per day / per week (one query)
        $bought = PurchaseLimitService::boughtForMany($userId, $cartItems->pluck('product')->filter());

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
                    // False when the store is hidden (plan ended, permit expired…) — the order can't be placed
                    'store_available'        => $store->isOpenToCustomers(),
                    // Delivery fee per vehicle type — the page picks the vehicle with lib/delivery-fee.ts quoteFee()
                    'delivery_options'       => $options = DeliveryFeeService::clientOptions($store),
                    'can_deliver'            => $options !== [],
                    'no_delivery_reason'     => $options === [] ? DeliveryFeeService::whyNoVehicle($store, 0, 0) : null,
                    // no_vehicle | vehicles_unavailable | no_delivery_fee | too_heavy — picks the hint under the message
                    'no_delivery_code'       => $options === [] ? DeliveryFeeService::whyNoVehicleCode($store, 0, 0) : null,
                    'store_lat'            => $store->latitude  ? (float) $store->latitude  : null,
                    'store_lng'              => $store->longitude ? (float) $store->longitude : null,
                    'max_delivery_radius_km' => $store->max_delivery_radius_km ? (int) $store->max_delivery_radius_km : null,
                    'allow_cod'              => (bool) ($store->allow_cod ?? true),
                    'allow_consignment'      => (bool) ($store->allow_consignment ?? true),
                    // Pick up at the store (₱0 delivery fee, no rider)
                    'allow_pickup'           => (bool) $store->allow_pickup,
                    'refund_window_days'     => (int) ($store->refund_window_days ?? 7),
                    'pickup_instructions'    => $store->pickup_instructions,
                    'store_address'          => ['address' => $store->address, 'barangay' => $store->barangay, 'city' => $store->city],
                    // Consignment is a loyalty benefit: store must allow it, run a loyalty
                    // program, and the customer's trust score must meet the store minimum
                    'consignment_available'  => $this->consignmentAvailable($store, $userId),
                    'min_down_payment_percent' => $this->downPaymentPercent($store, $userId),
                    'loyalty'                => $this->loyaltyTerms($storeId, $userId),
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
                'weight_kg'        => (float) ($product->weight_kg ?? 0),   // load for the vehicle choice
                'image_url'        => $product->image ? Storage::url($product->image) : null,
                'refill_price'     => (float) $product->refill_price,
                'purchase_price'   => (float) ($product->purchase_price ?? $product->refill_price),
                'transaction_type' => $ci->transaction_type,
                'quantity'         => $ci->quantity,
                'stock'            => $product->inventory?->quantity ?? 0,
                // Over the seller's max per customer (per order / day / week) → this line blocks checkout
                'max_per_order'    => $product->max_per_order,
                'limit_period'     => PurchaseLimitService::period($product),
                'limit_label'      => PurchaseLimitService::label($product),
                'bought_in_period' => $b = $bought[$product->id] ?? 0,
                'over_max'         => PurchaseLimitService::isOver($product, (int) $ci->quantity, $b),
                'limit_message'    => PurchaseLimitService::isOver($product, (int) $ci->quantity, $b)
                    ? PurchaseLimitService::message($product, $b, 0) : null,
            ];
        }

        return array_values($stores);
    }

    /**
     * "You can buy at most 5 of X per day. You already bought 3 today. …" when the quantity (+ what the customer
     * bought earlier in the period for per day / per week) is over the seller's limit, otherwise null.
     */
    private static function maxPerOrderError(?Product $product, int $quantity, int $bought = 0): ?string
    {
        if (! $product || ! PurchaseLimitService::isOver($product, $quantity, $bought)) {
            return null;
        }
        $left = max(0, $product->max_per_order - $bought);

        return "You can buy at most {$product->max_per_order} of {$product->name} per " . PurchaseLimitService::period($product) . '.'
            . ($bought > 0 ? " You already bought {$bought} " . (PurchaseLimitService::period($product) === 'day' ? 'today' : 'this week') . '.' : '')
            . ($left > 0 ? " Reduce the quantity in your cart to {$left} to continue." : ' Remove it from your cart to continue.');
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

        // Initial delivery pin: always from the customer's TEXT address (barangay_coordinates lookup,
        // else city centre). customers.latitude/longitude is deliberately NOT used — pins set at
        // registration are unreliable. The customer can still drag the pin for this order.
        $pin = null;
        $addressPoint = null;
        if ($customer) {
            $geo = \App\Http\Controllers\BarangayCoordinateController::resolve($customer->city, $customer->barangay);
            if ($geo['precision'] !== 'none') {
                $addressPoint = [(float) $geo['latitude'], (float) $geo['longitude']];
                $pin = ['lat' => $addressPoint[0], 'lng' => $addressPoint[1], 'source' => $geo['precision'], 'message' => $geo['message'] ?? null];
            }
        }

        // Saved delivery addresses (default first). First visit: the profile address becomes "Home".
        AddressController::ensureDefaultFromProfile($userId, $customer);
        $savedAddresses = AddressController::listFor($userId);

        return Inertia::render('customer/checkout', [
            'stores'   => $checkoutStores,
            'savedAddresses' => $savedAddresses,
            'customer' => $customer ? [
                'name'     => $customer->name,
                'phone'    => $customer->phone,
                'address'  => $customer->address,
                'city'     => $customer->city,
                'barangay' => $customer->barangay,
                'lat'      => $pin['lat'] ?? null,
                'lng'      => $pin['lng'] ?? null,
                'pin_source'  => $pin['source'] ?? null,   // barangay | city | null
                'pin_message' => $pin['message'] ?? null,
                // Centre of the typed address (fallback pin when the customer has no saved address)
                'address_lat' => $addressPoint[0] ?? null,
                'address_lng' => $addressPoint[1] ?? null,
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
                // Each store's order has its own payment option (payment_mode = legacy single choice)
                'payment_modes'              => 'nullable|array',
                'payment_modes.*'            => 'in:full,consignment,cod',
                'payment_mode'               => 'nullable|in:full,consignment,cod',
                // Optional consignment down payment per store (never below the tier minimum)
                'down_payment_percents'      => 'nullable|array',
                'down_payment_percents.*'    => 'integer|min:20|max:90',
                'coupon_ids'                 => 'nullable|array',
                'coupon_ids.*'               => 'integer',
                'coupon_code'                => 'nullable|string|max:40',
                'notes'                      => 'nullable|string|max:1000',
                'delivery_latitude'          => ['nullable', 'numeric', 'between:-90,90', new InServiceArea('delivery_longitude')],
                'delivery_longitude'         => 'nullable|numeric|between:-180,180',
                // Address the pin belongs to (saved address or map search); default: profile address
                'delivery_address'           => 'nullable|string|max:500',
                'delivery_barangay'          => 'nullable|string|max:100',
                'delivery_city'              => 'nullable|string|max:100',
                'estimated_delivery_minutes' => 'nullable|integer|min:0|max:9999',
                // Per store: deliver to me / pick up at the store
                'fulfillments'               => 'nullable|array',
                'fulfillments.*'             => 'in:delivery,pickup',
                'empty_tanks_confirmed'      => 'nullable|boolean',
                // Optional: the buyer's TIN for a business invoice (on every store's order of this checkout)
                'buyer_tin'                  => ['nullable', 'regex:/^\d{3}-\d{3}-\d{3}-\d{3,5}$/'],
            ], [
                'buyer_tin.regex' => 'Use the TIN format 000-000-000-00000.',
            ]);

            $deliveryLat  = isset($data['delivery_latitude'])  ? (float) $data['delivery_latitude']  : null;
            $deliveryLng  = isset($data['delivery_longitude']) ? (float) $data['delivery_longitude'] : null;
            $estimatedMin = isset($data['estimated_delivery_minutes']) ? (int) $data['estimated_delivery_minutes'] : null;

            // Snapshot the delivery address on the order: the one chosen at checkout, else the profile address.
            // (Riders see this text next to the pin, and later profile edits must not move the order.)
            $chosenAddress = trim((string) ($data['delivery_address'] ?? ''));
            $delivery = $chosenAddress !== ''
                ? ['address' => $chosenAddress, 'barangay' => $data['delivery_barangay'] ?? null, 'city' => $data['delivery_city'] ?? null]
                : ['address' => $customer->address, 'barangay' => $customer->barangay, 'city' => $customer->city];

            // The customer's pin is always used as-is: barangay centres are approximate, the customer
            // knows where they live. (The page shows a non-blocking note when the pin is far away.)
            $addressPoint = \App\Http\Controllers\BarangayCoordinateController::addressPoint($delivery['city'], $delivery['barangay']);

            // No map pin: place the order at the customer's barangay/city centre so it can be routed
            // (only for the map — the delivery fee still uses the flat fee, as before)
            $geoFallback = ($deliveryLat === null || $deliveryLng === null) ? $addressPoint : null;

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
            // Stores that are hidden right now (plan ended, permit expired…) are left out; the checkout page shows
            // them greyed. The per-store check inside the transaction below still guards against races.
            $checkoutStores = array_values(array_filter($checkoutStores, fn ($s) => $s['store_ref']?->isOpenToCustomers()));
            if (empty($checkoutStores)) {
                return $error('The selected stores are not available right now.');
            }
            // Seller's max per customer (per order / day / week) — checked before anything is created
            $boughtBefore = PurchaseLimitService::boughtForMany(auth()->id(), $cartItems->pluck('product')->filter());
            foreach ($cartItems as $ci) {
                if (($why = static::maxPerOrderError($ci->product, (int) $ci->quantity, $boughtBefore[$ci->product_id] ?? 0)) !== null) {
                    return $error($why);
                }
            }

            // Block checkout if any selected items are from the user's own store
            $ownStoreId = Store::where('user_id', auth()->id())->value('id');
            if ($ownStoreId) {
                foreach ($checkoutStores as $storeData) {
                    if ((int) $storeData['store_id'] === (int) $ownStoreId) {
                        return $error('You cannot place an order from your own store.');
                    }
                }
            }

            // Resolve and validate each store's own payment option
            $modes      = []; // store_id => full|consignment|cod
            $dpPercents = []; // store_id => consignment down payment %
            foreach ($checkoutStores as $storeData) {
                $s    = $storeData['store_ref'];
                $sid  = (int) $storeData['store_id'];
                $mode = $data['payment_modes'][$sid] ?? $data['payment_mode'] ?? null;

                if (! $mode) {
                    return $error("Please choose a payment option for {$storeData['store_name']}.");
                }
                if ($mode === 'cod' && $s && ! $s->allow_cod) {
                    return $error("{$s->store_name} does not accept Cash on Delivery.");
                }
                if ($mode === 'consignment' && $s && ! $this->consignmentAvailable($s, auth()->id())) {
                    return $error(($this->loyaltyTerms($s->id, auth()->id())['blocked_reason'] ?? null) === 'low_trust'
                        ? "Consignment is not available for you at {$s->store_name}. Complete orders and pay on time to improve your trust score."
                        : "{$s->store_name} does not offer Consignment.");
                }

                $modes[$sid] = $mode;
                if ($mode === 'consignment') {
                    $minPct = $this->downPaymentPercent($s, auth()->id());
                    $chosen = (int) ($data['down_payment_percents'][$sid] ?? $minPct);
                    $dpPercents[$sid] = max($minPct, min(90, $chosen));
                }
            }

            // Deliver to me / pick up at the store (per store), and the refill empty-tank exchange
            $fulfillments = []; // store_id => delivery|pickup
            foreach ($checkoutStores as $storeData) {
                $sid  = (int) $storeData['store_id'];
                $kind = $data['fulfillments'][$sid] ?? 'delivery';
                if ($kind === 'pickup' && ! $storeData['store_ref']?->allow_pickup) {
                    throw new CheckoutRuleException("{$storeData['store_name']} doesn't offer pick-up.");
                }
                $fulfillments[$sid] = $kind;
            }
            $hasRefill = collect($checkoutStores)->flatMap(fn ($s) => $s['items'])->contains(fn ($i) => ($i['transaction_type'] ?? 'refill') === 'refill');
            if ($hasRefill && ! $request->boolean('empty_tanks_confirmed')) {
                throw new CheckoutRuleException('Please confirm you have the empty tank(s) ready for exchange.');
            }

            // Create one order per store in a single DB transaction
            $result = DB::transaction(function () use ($geoFallback, $delivery, $checkoutStores, $customer, $request, $data, $modes, $dpPercents, $couponIds, $couponCode, $deliveryLat, $deliveryLng, $estimatedMin, $fulfillments) {
                // Per day / per week limits: lock the customer row FIRST so two checkouts at the same time (two tabs)
                // run one after the other — the second one then counts the first one's order.
                PurchaseLimitService::lockCustomer($customer->id);
                $boughtNow = PurchaseLimitService::boughtForMany($request->user()->id, Product::whereIn(
                    'id', collect($checkoutStores)->flatMap(fn ($s) => array_column($s['items'], 'product_id'))->all()
                )->get(['id', 'name', 'max_per_order', 'limit_period']));

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
                            throw new CheckoutRuleException("Insufficient stock for {$product->name}. Only {$stock} unit(s) left.");
                        }
                        if (($why = static::maxPerOrderError($product, (int) $cartItem['quantity'], $boughtNow[$product->id] ?? 0)) !== null) {
                            throw new CheckoutRuleException($why);
                        }

                        $txType = $cartItem['transaction_type'] ?? 'refill';
                        $price  = $txType === 'refill'
                            ? (float) $product->refill_price
                            : (float) ($product->purchase_price ?? $product->refill_price);
                        $sub    = $price * $cartItem['quantity'];

                        $subtotal      += $sub;
                        $transTypes[]   = $txType;
                        $orderedItems[] = [
                            'product'          => $product,
                            'quantity'         => $cartItem['quantity'],
                            'unit_price'       => $price,
                            'subtotal'         => $sub,
                            'transaction_type' => $txType,
                        ];
                    }

                    $txTypeFinal = (array_count_values($transTypes)['refill'] ?? 0) >= (array_count_values($transTypes)['new_purchase'] ?? 0)
                        ? 'refill' : 'new_purchase';

                    // Delivery fee: the cheapest of the store's vehicles that can carry this order (distance from the
                    // store pin to the customer pin; no distance → the base fee). Pick-up: ₱0, no vehicle.
                    $isPickup    = ($fulfillments[$store->id] ?? 'delivery') === 'pickup';
                    $distKm      = null;
                    $finalFee    = 0.0;
                    $vehicleType = null;
                    if (! $isPickup) {
                        if ($deliveryLat !== null && $deliveryLng !== null && (float) $store->latitude != 0.0 && (float) $store->longitude != 0.0) {
                            $distKm = DeliveryFeeService::distanceKm((float) $store->latitude, (float) $store->longitude, $deliveryLat, $deliveryLng);
                            $radius = (int) ($store->max_delivery_radius_km ?? 0);
                            if ($radius > 0 && $distKm > $radius) {
                                throw new CheckoutRuleException("{$store->store_name} doesn't deliver that far (" . number_format($distKm, 1)
                                    . " km, limit {$radius} km). Choose pick-up or another address.");
                            }
                        }
                        $load  = DeliveryFeeService::orderLoad($orderedItems);
                        $store->loadMissing(['vehicles', 'deliveryRates']);
                        $quote = DeliveryFeeService::quote($store, $distKm, $load['kg'], $load['tanks']);
                        if (! $quote) {
                            // "Reduce the quantity" only helps when the load is too heavy
                            $tooHeavy = DeliveryFeeService::whyNoVehicleCode($store, $load['kg'], $load['tanks']) === 'too_heavy';
                            $hint = match (true) {
                                $tooHeavy && (bool) $store->allow_pickup => ' Choose pick-up, or reduce the quantity.',
                                $tooHeavy                                => ' Reduce the quantity or remove some items.',
                                (bool) $store->allow_pickup              => ' You can pick it up at the store instead.',
                                default                                  => " This store can't deliver right now. Please try another store.",
                            };
                            throw new CheckoutRuleException("{$store->store_name}: " . DeliveryFeeService::whyNoVehicle($store, $load['kg'], $load['tanks']) . $hint);
                        }
                        $finalFee    = $quote['fee'];
                        $vehicleType = $quote['vehicle_type'];
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

                    // Refill tanks (products with a size) = empty tanks to hand over
                    $emptyTanks = collect($orderedItems)->filter(fn ($i) => $i['transaction_type'] === 'refill' && (float) $i['product']->weight_kg > 0)->sum('quantity');

                    $prepared[$store->id] = compact('store', 'subtotal', 'orderedItems', 'txTypeFinal', 'distKm', 'finalFee', 'storeCoupon', 'discount', 'isPickup', 'emptyTanks', 'vehicleType');
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

                    $paymentMode = $modes[$storeId];

                    // Consignment: tier-based (or customer-raised) down payment now, balance after delivery
                    $downPayment      = null;
                    $remainingBalance = null;
                    if ($paymentMode === 'consignment') {
                        $downPayment      = round($grandTotal * $dpPercents[$storeId] / 100, 2);
                        $remainingBalance = round($grandTotal - $downPayment, 2);
                    }

                    $order = Order::create([
                        'order_number'               => $this->generateOrderNumber(),
                        'customer_id'                => $customer->id,
                        'store_id'                   => $store->id,
                        // Refund window snapshot: later changes by the store don't affect this order
                        'refund_window_days'         => (int) ($store->refund_window_days ?? 7),
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
                        // Pick-up orders keep no delivery address / pin (not even the barangay fallback)
                        'delivery_latitude'          => $p['isPickup'] ? null : ($deliveryLat ?? $geoFallback[0] ?? null),
                        'delivery_longitude'         => $p['isPickup'] ? null : ($deliveryLng ?? $geoFallback[1] ?? null),
                        'delivery_address'           => $p['isPickup'] ? null : ($delivery['address'] ?: null),
                        'delivery_barangay'          => $p['isPickup'] ? null : ($delivery['barangay'] ?: null),
                        'delivery_city'              => $p['isPickup'] ? null : ($delivery['city'] ?: null),
                        'delivery_distance_km'       => $p['distKm'] !== null ? round($p['distKm'], 2) : null,
                        'estimated_delivery_minutes' => $p['isPickup'] ? null : $estimatedMin,
                        'fulfillment'                => $p['isPickup'] ? 'pickup' : 'delivery',
                        'delivery_vehicle_type'      => $p['vehicleType'],
                        'empty_tanks_required'       => $p['emptyTanks'],
                        'buyer_tin'                  => ($data['buyer_tin'] ?? null) ?: null,
                    ]);

                    foreach ($p['orderedItems'] as $item) {
                        OrderItem::create([
                            'order_id'   => $order->id,
                            'product_id' => $item['product']->id,
                            'quantity'   => $item['quantity'],
                            'unit_price' => $item['unit_price'],
                            'subtotal'   => $item['subtotal'],
                            'transaction_type' => $item['transaction_type'],
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
                        'mode'         => $paymentMode,
                        'dp_percent'   => $dpPercents[$storeId] ?? null,
                        // Amount collected online right now
                        'pay_now'      => match ($paymentMode) {
                            'consignment' => $downPayment,
                            'cod'         => 0.0,
                            default       => $grandTotal,
                        },
                    ];
                }

                // One coupon_uses row per discounted order,
                // grouped by checkout_ref so a multi-store checkout counts as a single use.
                if ($promo) {
                    $checkoutRef = (string) \Illuminate\Support\Str::uuid();
                    foreach ($createdOrders as $entry) {
                        $cut = (float) $entry['order']->coupon_discount;
                        if ($cut <= 0) {
                            continue;
                        }
                        CouponUse::create([
                            'coupon_id'        => $promo->id,
                            'user_id'          => $request->user()->id,
                            'order_id'         => $entry['order']->id,
                            'discount_applied' => $cut,
                            'checkout_ref'     => $checkoutRef,
                        ]);
                    }
                    $promo->increment('used_count');
                }

                // The PayMongo session is created BEFORE the transaction commits: if PayMongo can't be
                // reached (or errors), everything above rolls back — no orders, no coupon use — and the
                // cart, notifications and chat messages below/after commit never happen.

                // Orders fully covered by a store coupon need no online payment
                foreach ($createdOrders as $entry) {
                    if ($entry['mode'] === 'full' && $entry['pay_now'] <= 0) {
                        $entry['order']->update(['payment_status' => 'paid']);
                    }
                }

                // Only Full Payment / Consignment orders are charged online. COD orders are simply
                // placed (the rider collects cash) — in a mixed checkout they stay placed even if
                // the customer leaves the PayMongo page.
                $toCharge = array_values(array_filter($createdOrders, fn ($e) => $e['pay_now'] > 0));
                if (empty($toCharge)) {
                    return ['orders' => $createdOrders, 'session' => null];
                }

                $paymongo  = app(PayMongoService::class);
                $user      = $request->user();
                $lineItems = [];

                foreach ($toCharge as $entry) {
                    $order = $entry['order'];
                    $store = $entry['store'];
                    $order->load('items.product');

                    if ($entry['mode'] === 'consignment') {
                        $pct = $entry['dp_percent'];
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
                    'description'      => collect($toCharge)->every(fn ($e) => $e['mode'] === 'consignment') && count($toCharge) === 1
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

                return ['orders' => $createdOrders, 'session' => $session];
            });

            ['orders' => $orders, 'session' => $session] = $result;

            // Only now (orders committed, payment page ready) — remove ordered items from DB cart (leave unselected items intact)
            CartItem::where('user_id', auth()->id())
                ->whereIn('product_id', $selected)
                ->delete();
            session()->forget('cart_selected');

            // Notify each store owner (and their staff) about the new order
            foreach ($orders as $entry) {
                $ord       = $entry['order'];
                $store     = $entry['store'];
                $modeLabel = self::PAYMENT_MODE_LABELS[$entry['mode']];
                NotificationService::sendToStore(
                    $store->id,
                    'order_update',
                    'New Order Received',
                    "Order #{$ord->order_number} has been placed ({$modeLabel}). Total: ₱" . number_format($ord->grandTotal(), 2),
                    ['order_id' => $ord->id, 'link' => '/seller/orders/' . $ord->id]
                );
            }

            // Nothing to charge online (COD only / fully covered by coupons)
            if ($session === null) {
                $anyCod = collect($orders)->contains(fn ($e) => $e['mode'] === 'cod');
                return response()->json(['redirect_url' => url('/customer/orders?placed=' . ($anyCod ? 'cod' : '1'))]);
            }

            return response()->json(['checkout_url' => $session['checkout_url']]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (CouponException $e) {
            return $error($e->getMessage());
        } catch (CheckoutRuleException $e) {
            // Stock / max per order: the customer sees the real reason (the transaction rolled back)
            return $error($e->getMessage());
        } catch (\App\Exceptions\PaymentServiceUnavailable $e) {
            // No connection to PayMongo — the transaction rolled back, nothing was saved
            Log::warning('Checkout: payment service unreachable', ['user_id' => auth()->id(), 'error' => $e->getPrevious()?->getMessage() ?? $e->getMessage()]);
            $msg = "We couldn't reach the payment service. Please check your internet connection and try again, or choose Cash on Delivery.";
            if ($isJson) {
                return response()->json(['error' => $msg], 422);
            }
            return back()->with('error', $msg);
        } catch (\Throwable $e) {
            Log::error('Checkout store() error: ' . $e->getMessage(), [
                'user_id' => auth()->id(),
                'file'    => $e->getFile(),
                'line'    => $e->getLine(),
            ]);
            $msg = $e instanceof \RuntimeException && str_starts_with($e->getMessage(), '[PayMongo]')
                ? 'The payment service had a problem. Please try again in a moment, or choose Cash on Delivery.'
                : (app()->isLocal() ? $e->getMessage() : 'Checkout failed. Please try again or use Cash on Delivery.');
            if ($isJson) {
                return response()->json(['error' => $msg], 422);
            }
            return back()->with('error', $msg);
        }
    }
}
