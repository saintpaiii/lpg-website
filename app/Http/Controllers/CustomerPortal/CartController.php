<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Product;
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
        $items = CartItem::with(['product.inventory', 'store'])
            ->where('user_id', $userId)
            ->get();

        if ($items->isEmpty()) {
            return null;
        }

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
                    'delivery_fee' => (float) ($store->delivery_fee ?? 0),
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
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->firstOrFail();

        $stock = $product->inventory?->quantity ?? 0;
        if ($stock === 0) {
            return back()->with('error', "{$product->name} is out of stock.");
        }

        $userId   = auth()->id();
        $existing = CartItem::where('user_id', $userId)
            ->where('product_id', $product->id)
            ->first();

        if ($existing) {
            $newQty = $existing->quantity + (int) $request->quantity;
            if ($newQty > $stock) {
                return back()->with('error', "Cannot add more. Only {$stock} unit(s) available for {$product->name}.");
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

            $updates = ['quantity' => min((int) $request->quantity, $stock)];
            if ($request->transaction_type) {
                $updates['transaction_type'] = $request->transaction_type;
            }
            $cartItem->update($updates);
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
