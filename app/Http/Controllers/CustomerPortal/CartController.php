<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Product;
use App\Services\PurchaseLimitService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class CartController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Build the cart payload for the frontend from DB cart_items.
     * Returns ['stores' => [store_id => StoreGroup]] or null if empty.
     */
    private function buildCartResponse(int $userId): ?array
    {
        $items = CartItem::with(['product.inventory', 'store.vehicles', 'store.deliveryRates'])
            ->where('user_id', $userId)
            ->get();

        if ($items->isEmpty()) {
            return null;
        }

        // Bought earlier today / this week, for products limited per day / per week (one query)
        $bought = PurchaseLimitService::boughtForMany($userId, $items->pluck('product')->filter());

        $stores = [];
        foreach ($items as $ci) {
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
                    'store_logo_url' => $store->logo ? \Illuminate\Support\Facades\Storage::url($store->logo) : null,
                    // Cheapest delivery option ("Delivery from ₱40") — the final fee is computed at checkout
                    'delivery_from' => \App\Services\DeliveryFeeService::fromFee($store),
                    'allow_pickup'  => (bool) $store->allow_pickup,
                    // False when the store is hidden (plan ended, permit expired…): its items can't be checked out
                    'store_available' => $store->isOpenToCustomers(),
                    'items'        => [],
                ];
            }

            $stock = $product->inventory?->quantity ?? 0;
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
                'stock'            => $stock,
                // Seller's limit per customer (null = no limit) per order / day / week; over it when the seller
                // lowered it later or when earlier orders of the period already used part of it
                'max_per_order'    => $product->max_per_order,
                'limit_period'     => PurchaseLimitService::period($product),
                'limit_label'      => PurchaseLimitService::label($product),
                'bought_in_period' => $b = $bought[$product->id] ?? 0,
                'over_max'         => PurchaseLimitService::isOver($product, (int) $ci->quantity, $b),
                'limit_message'    => PurchaseLimitService::isOver($product, (int) $ci->quantity, $b)
                    ? PurchaseLimitService::message($product, $b, 0) : null,
            ];
        }

        if (empty($stores)) {
            return null;
        }

        return ['stores' => $stores];
    }

    // ── Routes ────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        return Inertia::render('customer/cart', [
            'cart' => $this->buildCartResponse(auth()->id()),
        ]);
    }

    public function add(Request $request): RedirectResponse
    {
        $request->validate([
            'product_id'       => 'required|exists:products,id',
            'quantity'         => 'required|integer|min:1|max:999',
            'transaction_type' => 'required|in:refill,new_purchase',
        ]);

        $product = Product::with(['store', 'inventory'])
            ->where('id', $request->product_id)
            ->where('is_active', true)
            ->whereHas('store', fn ($q) => $q->visibleToCustomers())
            ->firstOrFail();

        // Block purchasing from own store
        $ownStoreId = \App\Models\Store::where('user_id', auth()->id())->value('id');
        if ($ownStoreId && $product->store_id === $ownStoreId) {
            return back()->with('error', 'You cannot purchase products from your own store.');
        }

        $stock = $product->inventory?->quantity ?? 0;
        if ($stock === 0) {
            return back()->with('error', "{$product->name} is out of stock.");
        }

        $userId   = auth()->id();
        $existing = CartItem::where('user_id', $userId)
            ->where('product_id', $product->id)
            ->first();

        // Seller's limit per customer: per order (one cart line per product = the quantity in the order),
        // per day / per week (+ what the customer already bought in that period)
        $inCart = (int) ($existing?->quantity ?? 0);
        if ($product->max_per_order !== null) {
            $bought = PurchaseLimitService::boughtInPeriod($userId, $product, PurchaseLimitService::period($product));
            if (PurchaseLimitService::isOver($product, $inCart + (int) $request->quantity, $bought)) {
                return back()->with('error', PurchaseLimitService::message($product, $bought, $inCart));
            }
        }

        if ($existing) {
            $newQty = $existing->quantity + (int) $request->quantity;
            if ($newQty > $stock) {
                // Say what is already in the cart, so "only 2 available" makes sense when adding 2 of 2
                $inCart  = $existing->quantity;
                $canAdd  = $stock - $inCart;
                return back()->with('error', $canAdd > 0
                    ? "You already have {$inCart} in your cart. Only {$stock} available, so you can add {$canAdd} more."
                    : "You already have all {$stock} available in your cart.");
            }
            $existing->update([
                'quantity'         => $newQty,
                'transaction_type' => $request->transaction_type,
            ]);
        } else {
            if ($stock < $request->quantity) {
                return back()->with('error', "Only {$stock} unit(s) available for {$product->name}.");
            }
            CartItem::create([
                'user_id'          => $userId,
                'product_id'       => $product->id,
                'store_id'         => $product->store_id,
                'quantity'         => (int) $request->quantity,
                'transaction_type' => $request->transaction_type,
            ]);
        }

        return back()->with('success', "{$product->name} added to cart.");
    }

    public function update(Request $request): RedirectResponse
    {
        $request->validate([
            'product_id'       => 'required|integer',
            'quantity'         => 'required|integer|min:0|max:999',
            'transaction_type' => 'nullable|in:refill,new_purchase',
        ]);

        $cartItem = CartItem::where('user_id', auth()->id())
            ->where('product_id', (int) $request->product_id)
            ->first();

        if (! $cartItem) {
            return back();
        }

        if ((int) $request->quantity === 0) {
            $cartItem->delete();
        } else {
            $product = Product::with('inventory')->find($request->product_id);
            $stock   = $product?->inventory?->quantity ?? PHP_INT_MAX;

            // Max the cart line may hold: the seller's limit minus what was bought earlier today / this week
            $bought  = $product && $product->max_per_order !== null
                ? PurchaseLimitService::boughtInPeriod(auth()->id(), $product, PurchaseLimitService::period($product)) : 0;
            $max     = $product?->max_per_order !== null ? max(1, $product->max_per_order - $bought) : PHP_INT_MAX;

            $updates = ['quantity' => min((int) $request->quantity, $stock, $max)];
            if ($request->transaction_type) {
                $updates['transaction_type'] = $request->transaction_type;
            }
            $cartItem->update($updates);

            if ((int) $request->quantity > $max && $max <= $stock) {
                return back()->with('error', PurchaseLimitService::message($product, $bought, 0));
            }
        }

        return back();
    }

    public function remove(Request $request): RedirectResponse
    {
        $request->validate(['product_id' => 'required|integer']);

        CartItem::where('user_id', auth()->id())
            ->where('product_id', (int) $request->product_id)
            ->delete();

        return back()->with('success', 'Item removed from cart.');
    }

    public function clear(): RedirectResponse
    {
        CartItem::where('user_id', auth()->id())->delete();
        session()->forget('cart_selected');
        return back()->with('success', 'Cart cleared.');
    }
}
