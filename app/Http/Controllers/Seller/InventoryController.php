<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InventoryController extends Controller
{
    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $tab   = $request->input('tab', 'overview');

        $productList = Product::where('store_id', $store->id)
            ->orderBy('name')
            ->get(['id', 'name', 'brand']);

        if ($tab === 'transactions') {
            $query = InventoryTransaction::with([
                'product' => fn ($q) => $q->withTrashed(),
                'user',
            ])->whereHas('product', fn ($q) => $q->withTrashed()->where('store_id', $store->id))
              ->latest();

            if ($productId = $request->input('product_id')) {
                $query->where('product_id', $productId);
            }

            if ($type = $request->input('type')) {
                $query->where('type', $type);
            }

            if ($dateFrom = $request->input('date_from')) {
                $query->whereDate('created_at', '>=', $dateFrom);
            }

            if ($dateTo = $request->input('date_to')) {
                $query->whereDate('created_at', '<=', $dateTo);
            }

            $transactions = $query->paginate(20)->withQueryString()
                ->through(fn ($t) => [
                    'id'         => $t->id,
                    'type'       => $t->type,
                    'quantity'   => $t->quantity,
                    'reference'  => $t->reference,
                    'notes'      => $t->notes,
                    'created_at' => $t->created_at->format('M d, Y g:i A'),
                    'product'    => $t->product ? ['id' => $t->product->id, 'name' => $t->product->name, 'brand' => $t->product->brand] : null,
                    'user'       => $t->user ? ['name' => $t->user->name] : null,
                ]);

            return Inertia::render('seller/inventory', [
                'tab'          => 'transactions',
                'transactions' => $transactions,
                'productList'  => $productList,
                'filters'      => (object) $request->only('product_id', 'type', 'date_from', 'date_to', 'tab'),
            ]);
        }

        // Stock overview
        $search = $request->input('search');

        $query = Inventory::with('product')
            ->whereHas('product', fn ($q) => $q->where('store_id', $store->id));

        if ($search) {
            $query->whereHas('product', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('brand', 'like', "%{$search}%");
            });
        }

        $inventories = $query
            ->join('products', 'inventories.product_id', '=', 'products.id')
            ->orderBy('products.name')
            ->select('inventories.*')
            ->paginate(20)->withQueryString()
            ->through(fn ($i) => [
                'id'            => $i->id,
                'quantity'      => $i->quantity,
                'reorder_level' => $i->reorder_level,
                'product' => $i->product ? [
                    'id'        => $i->product->id,
                    'name'      => $i->product->name,
                    'brand'     => $i->product->brand ?? '',
                    'is_active' => $i->product->is_active,
                ] : ['id' => 0, 'name' => 'Unknown', 'brand' => '', 'is_active' => false],
            ]);

        return Inertia::render('seller/inventory', [
            'tab'         => 'overview',
            'inventories' => $inventories,
            'productList' => $productList,
            'filters'     => (object) $request->only('search', 'tab'),
        ]);
    }

    public function stockIn(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'quantity' => 'required|integer|min:1',
            'notes'    => 'nullable|string|max:500',
        ]);

        $inventory = $product->inventory;
        if (! $inventory) return back()->with('error', 'No inventory record found.');

        $inventory->increment('quantity', $data['quantity']);
        InventoryTransaction::create([
            'product_id' => $product->id,
            'type'       => 'in',
            'quantity'   => $data['quantity'],
            'notes'      => $data['notes'] ?? null,
            'user_id'    => auth()->id(),
        ]);

        return back()->with('success', "Added {$data['quantity']} unit(s) to {$product->name}.");
    }

    public function stockOut(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'quantity' => 'required|integer|min:1',
            'notes'    => 'nullable|string|max:500',
        ]);

        $inventory = $product->inventory;
        if (! $inventory) return back()->with('error', 'No inventory record found.');
        if ($inventory->quantity < $data['quantity']) {
            return back()->with('error', "Insufficient stock. Current: {$inventory->quantity} unit(s).");
        }

        $inventory->decrement('quantity', $data['quantity']);
        InventoryTransaction::create([
            'product_id' => $product->id,
            'type'       => 'out',
            'quantity'   => $data['quantity'],
            'notes'      => $data['notes'] ?? null,
            'user_id'    => auth()->id(),
        ]);

        return back()->with('success', "Removed {$data['quantity']} unit(s) from {$product->name}.");
    }

    public function updateReorderLevel(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $data = $request->validate(['reorder_level' => 'required|integer|min:0|max:9999']);
        $product->inventory?->update(['reorder_level' => $data['reorder_level']]);

        return back()->with('success', "Reorder level updated for {$product->name}.");
    }
}
