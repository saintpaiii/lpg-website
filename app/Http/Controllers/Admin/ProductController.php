<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Product::with(['inventory', 'store']);

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('brand', 'like', "%{$search}%")
                  ->orWhereHas('store', fn ($sq) => $sq->where('store_name', 'like', "%{$search}%"));
            });
        }

        if ($request->input('status') === 'active') {
            $query->where('is_active', true);
        } elseif ($request->input('status') === 'inactive') {
            $query->where('is_active', false);
        }

        $products = $query
            ->withCount('orderItems')
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($p) => [
                'id'               => $p->id,
                'name'             => $p->name,
                'brand'            => $p->brand,
                'weight'           => $p->weight,
                'weight_kg'        => (float) ($p->weight_kg ?? 0),
                'refill_price'     => (float) ($p->refill_price ?? $p->selling_price ?? 0),
                'purchase_price'   => (float) ($p->purchase_price ?? $p->selling_price ?? 0),
                'description'      => $p->description,
                'is_active'        => $p->is_active,
                'order_items_count'=> $p->order_items_count,
                'store_id'         => $p->store_id,
                'store_name'       => $p->store?->store_name,
                'store_city'       => $p->store?->city,
                'inventory' => $p->inventory ? [
                    'quantity'      => $p->inventory->quantity,
                    'reorder_level' => $p->inventory->reorder_level,
                ] : null,
            ]);

        return Inertia::render('admin/products', [
            'products' => $products,
            'filters'  => $request->only('search', 'status'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:255',
            'brand'         => 'nullable|string|max:100',
            'weight_kg'     => 'required|numeric|min:0.1|max:999',
            'selling_price' => 'required|numeric|min:0',
            'cost_price'    => 'required|numeric|min:0',
            'description'   => 'nullable|string|max:1000',
        ]);

        $product = Product::create($data);

        Inventory::create([
            'product_id'    => $product->id,
            'quantity'      => 0,
            'reorder_level' => 10,
        ]);

        return back()->with('success', 'Product created successfully.');
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:255',
            'brand'         => 'nullable|string|max:100',
            'weight_kg'     => 'required|numeric|min:0.1|max:999',
            'selling_price' => 'required|numeric|min:0',
            'cost_price'    => 'required|numeric|min:0',
            'description'   => 'nullable|string|max:1000',
        ]);

        $product->update($data);

        return back()->with('success', 'Product updated successfully.');
    }

    public function toggle(Product $product): RedirectResponse
    {
        $product->update(['is_active' => ! $product->is_active]);

        $label = $product->is_active ? 'activated' : 'deactivated';

        return back()->with('success', "Product {$label} successfully.");
    }

    public function destroy(Product $product): RedirectResponse
    {
        if ($product->orderItems()->exists()) {
            return back()->with('error', 'Cannot delete a product that has existing orders.');
        }

        // Remove inventory record first (no cascade on DB level needed, but safer)
        $product->inventory?->delete();
        $product->delete();

        return back()->with('success', 'Product deleted successfully.');
    }
}
