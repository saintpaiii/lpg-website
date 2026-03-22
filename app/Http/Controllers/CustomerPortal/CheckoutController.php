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
    private function generateOrderNumber(): string
    {
        $year  = date('Y');
        $count = Order::withTrashed()->whereYear('created_at', $year)->count();
        return 'ORD-' . $year . '-' . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Build checkout store groups from DB cart_items, filtered to selected product IDs.
     */
    private function buildCheckoutStores(int $userId, array $selectedProductIds): array
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
                    'store_id'     => $storeId,
                    'store_name'   => $store->store_name,
                    'delivery_fee' => (float) ($store->delivery_fee ?? 0),
                    'items'        => [],
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

        $checkoutStores = $this->buildCheckoutStores($userId, $selected);

        if (empty($checkoutStores)) {
            return redirect('/customer/products')->with('error', 'Your cart is empty. Browse products to start shopping.');
        }

        $customer = Customer::where('user_id', $userId)->first();

        return Inertia::render('customer/checkout', [
            'stores'   => $checkoutStores,
            'customer' => $customer ? [
                'name'     => $customer->name,
                'phone'    => $customer->phone,
                'address'  => $customer->address,
                'city'     => $customer->city,
                'barangay' => $customer->barangay,
            ] : null,
        ]);
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

            $customer = Customer::where('user_id', auth()->id())->first();
            if (! $customer) {
                return $error('Customer profile not found. Please complete your profile first.');
            }

            $data = $request->validate([
                'payment_type' => 'required|in:cod,online',
                'notes'        => 'nullable|string|max:1000',
            ]);

            $isCod = $data['payment_type'] === 'cod';

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

            // Create one order per store in a single DB transaction
            $orders = DB::transaction(function () use ($checkoutStores, $customer, $request, $data, $isCod) {
                $createdOrders = [];

                foreach ($checkoutStores as $storeData) {
                    $store = Store::where('id', $storeData['store_id'])
                        ->where('status', 'approved')
                        ->first();

                    if (! $store) {
                        throw new \RuntimeException("Store '{$storeData['store_name']}' is no longer available.");
                    }

                    $totalAmount  = 0;
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

                        $totalAmount   += $sub;
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

                    $order = Order::create([
                        'order_number'     => $this->generateOrderNumber(),
                        'customer_id'      => $customer->id,
                        'store_id'         => $store->id,
                        'transaction_type' => $txTypeFinal,
                        'status'           => 'pending',
                        'total_amount'     => $totalAmount,
                        'shipping_fee'     => (float) ($storeData['delivery_fee'] ?? 0),
                        'payment_method'   => $isCod ? 'cash' : null,
                        'payment_status'   => 'unpaid',
                        'notes'            => $data['notes'] ?? null,
                        'ordered_at'       => now(),
                        'created_by'       => $request->user()->id,
                    ]);

                    foreach ($orderedItems as $item) {
                        OrderItem::create([
                            'order_id'   => $order->id,
                            'product_id' => $item['product']->id,
                            'quantity'   => $item['quantity'],
                            'unit_price' => $item['unit_price'],
                            'subtotal'   => $item['subtotal'],
                        ]);
                    }

                    $createdOrders[] = [
                        'order'        => $order,
                        'store'        => $store,
                        'delivery_fee' => $storeData['delivery_fee'] ?? 0,
                    ];
                }

                return $createdOrders;
            });

            // Remove ordered items from DB cart (leave unselected items intact)
            CartItem::where('user_id', auth()->id())
                ->whereIn('product_id', $selected)
                ->delete();
            session()->forget('cart_selected');

            // COD — redirect to orders list
            if ($isCod) {
                $count = count($orders);
                $msg   = $count === 1
                    ? 'Order placed! We will confirm it shortly.'
                    : "{$count} orders placed! We will confirm them shortly.";
                return redirect('/customer/orders')->with('success', $msg);
            }

            // Online payment — create one PayMongo checkout for all orders combined
            $paymongo  = app(PayMongoService::class);
            $user      = $request->user();
            $lineItems = [];

            foreach ($orders as $entry) {
                $order = $entry['order'];
                $store = $entry['store'];
                $order->load('items.product');

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

            $firstOrder = $orders[0]['order'];
            $storeNames = implode(', ', array_map(fn ($e) => $e['store']->store_name, $orders));

            $session = $paymongo->createCheckoutSession([
                'reference_number' => $firstOrder->order_number,
                'description'      => count($orders) > 1
                    ? 'LPG Orders from ' . $storeNames
                    : "LPG Order {$firstOrder->order_number} from {$orders[0]['store']->store_name}",
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

            // One Payment record per order — all share the same checkout_id
            foreach ($orders as $entry) {
                Payment::create([
                    'order_id'             => $entry['order']->id,
                    'paymongo_checkout_id' => $session['id'],
                    'amount'               => $entry['order']->total_amount + (float) $entry['delivery_fee'],
                    'status'               => 'pending',
                ]);
            }

            return response()->json(['checkout_url' => $session['checkout_url']]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
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
