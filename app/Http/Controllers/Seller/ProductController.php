<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    private function fmt(Product $p): array
    {
        return [
            'id'               => $p->id,
            'name'             => $p->name,
            'brand'            => $p->brand ?? '',
            'weight'           => $p->weight ?? '',
            'description'      => $p->description,
            'refill_price'     => (float) ($p->refill_price ?? 0),
            'purchase_price'   => (float) ($p->purchase_price ?? 0),
            'selling_price'    => (float) ($p->selling_price ?? 0),
            'is_active'        => $p->is_active,
            'image_url'        => $p->image ? Storage::url($p->image) : null,
            'stock'            => $p->inventory?->quantity ?? 0,
            'reorder_level'    => $p->inventory?->reorder_level ?? 10,
            'created_at'       => $p->created_at->format('M d, Y'),
            'deleted_at'       => $p->deleted_at?->format('M d, Y'),
            'avg_rating'       => round((float) ($p->ratings_avg_rating ?? 0), 1),
            'review_count'     => (int) ($p->ratings_count ?? 0),
        ];
    }

    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $tab   = $request->input('tab', 'active');
        $search = $request->input('search');

        $query = Product::withTrashed()
            ->where('store_id', $store->id)
            ->with('inventory')
            ->withAvg('ratings', 'rating')
            ->withCount('ratings');

        if ($tab === 'archived') {
            $query->onlyTrashed();
        } elseif ($tab === 'inactive') {
            $query->whereNull('deleted_at')->where('is_active', false);
        } else {
            $query->whereNull('deleted_at')->where('is_active', true);
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('brand', 'like', "%{$search}%");
            });
        }

        $products = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($p) => $this->fmt($p));

        $counts = [
            'active'   => Product::where('store_id', $store->id)->where('is_active', true)->count(),
            'inactive' => Product::where('store_id', $store->id)->where('is_active', false)->count(),
            'archived' => Product::onlyTrashed()->where('store_id', $store->id)->count(),
        ];

        return Inertia::render('seller/products', [
            'products' => $products,
            'counts'   => $counts,
            'tab'      => $tab,
            'search'   => $search ?? '',
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'name'           => 'required|string|max:255',
            'brand'          => 'nullable|string|max:100',
            'weight'         => 'nullable|string|max:50',
            'description'    => 'nullable|string|max:1000',
            'refill_price'   => 'required|numeric|min:0',
            'purchase_price' => 'required|numeric|min:0',
            'stock'          => 'required|integer|min:0',
            'reorder_level'  => 'required|integer|min:0',
            'image'          => 'nullable|image|mimes:jpg,jpeg,png|max:5120',
        ]);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('store-products', 'public');
        }

        $product = Product::create([
            'store_id'       => $store->id,
            'name'           => $data['name'],
            'brand'          => $data['brand'] ?? null,
            'weight'         => $data['weight'] ?? null,
            'description'    => $data['description'] ?? null,
            'refill_price'   => $data['refill_price'],
            'purchase_price' => $data['purchase_price'],
            'selling_price'  => $data['purchase_price'],
            'cost_price'     => $data['purchase_price'],
            'is_active'      => true,
            'image'          => $imagePath,
        ]);

        Inventory::create([
            'product_id'    => $product->id,
            'quantity'      => $data['stock'],
            'reorder_level' => $data['reorder_level'],
        ]);

        return redirect()->route('seller.products')->with('success', "Product \"{$product->name}\" created.");
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        if ($product->store_id !== $store->id) {
            abort(403);
        }

        $data = $request->validate([
            'name'           => 'required|string|max:255',
            'brand'          => 'nullable|string|max:100',
            'weight'         => 'nullable|string|max:50',
            'description'    => 'nullable|string|max:1000',
            'refill_price'   => 'required|numeric|min:0',
            'purchase_price' => 'required|numeric|min:0',
            'reorder_level'  => 'required|integer|min:0',
            'image'          => 'nullable|image|mimes:jpg,jpeg,png|max:5120',
        ]);

        $updates = [
            'name'           => $data['name'],
            'brand'          => $data['brand'] ?? null,
            'weight'         => $data['weight'] ?? null,
            'description'    => $data['description'] ?? null,
            'refill_price'   => $data['refill_price'],
            'purchase_price' => $data['purchase_price'],
        ];

        if ($request->hasFile('image')) {
            if ($product->image) {
                Storage::disk('public')->delete($product->image);
            }
            $updates['image'] = $request->file('image')->store('store-products', 'public');
        }

        $product->update($updates);

        if ($product->inventory) {
            $product->inventory->update(['reorder_level' => $data['reorder_level']]);
        }

        return redirect()->route('seller.products')->with('success', "Product \"{$product->name}\" updated.");
    }

    public function toggle(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $product->update(['is_active' => ! $product->is_active]);
        $state = $product->is_active ? 'activated' : 'deactivated';

        return back()->with('success', "Product \"{$product->name}\" {$state}.");
    }

    public function destroy(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $product->delete();
        return back()->with('success', "Product \"{$product->name}\" archived.");
    }

    public function restore(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $product->restore();
        return back()->with('success', "Product \"{$product->name}\" restored.");
    }

    public function forceDestroy(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        if ($product->image) {
            Storage::disk('public')->delete($product->image);
        }

        $name = $product->name;
        $product->forceDelete();
        return back()->with('success', "Product \"{$name}\" permanently deleted.");
    }
}
