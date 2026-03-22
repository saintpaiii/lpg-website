<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use App\Models\Rating;

class ProductBrowseController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Product::with(['store', 'inventory'])
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->whereNotNull('refill_price');

        // Search
        if ($search = $request->get('search')) {
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('brand', 'like', "%{$search}%")
                ->orWhere('weight', 'like', "%{$search}%")
            );
        }

        // Filters
        if ($city = $request->get('city')) {
            $query->whereHas('store', fn ($q) => $q->where('city', $city));
        }

        if ($brand = $request->get('brand')) {
            $query->where('brand', $brand);
        }

        if ($weight = $request->get('weight')) {
            $query->where('weight', $weight);
        }

        if ($minPrice = $request->get('min_price')) {
            $query->where('refill_price', '>=', (float) $minPrice);
        }

        if ($maxPrice = $request->get('max_price')) {
            $query->where('refill_price', '<=', (float) $maxPrice);
        }

        // Sort
        $sort = $request->get('sort', 'newest');

        match ($sort) {
            'price_asc'  => $query->orderBy('refill_price', 'asc'),
            'price_desc' => $query->orderBy('refill_price', 'desc'),
            default      => $query->orderByDesc('products.created_at'),
        };

        $products = $query->paginate(20)->withQueryString()->through(fn ($p) => [
            'id'             => $p->id,
            'name'           => $p->name,
            'brand'          => $p->brand,
            'weight'         => $p->weight,
            'weight_kg'      => (float) ($p->weight_kg ?? 0),
            'description'    => $p->description,
            'refill_price'   => (float) $p->refill_price,
            'purchase_price' => (float) ($p->purchase_price ?? $p->refill_price),
            'image_url'      => $p->image ? Storage::url($p->image) : null,
            'stock'          => $p->inventory?->quantity ?? 0,
            'store_id'       => $p->store_id,
            'store_name'     => $p->store?->store_name ?? '',
            'store_city'     => $p->store?->city ?? '',
            'store_barangay' => $p->store?->barangay ?? '',
            'store_province' => $p->store?->province ?? '',
            'delivery_fee'   => (float) ($p->store?->delivery_fee ?? 0),
            'avg_rating'     => round((float) ($p->ratings_avg_rating ?? 0), 1),
            'review_count'   => (int) ($p->ratings_count ?? 0),
        ]);

        // Filter option lists
        $cities  = Store::where('status', 'approved')->distinct()->orderBy('city')->whereNotNull('city')->pluck('city');
        $brands  = Product::where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->distinct()->orderBy('brand')->whereNotNull('brand')->pluck('brand');
        $weights = Product::where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->distinct()->orderBy('weight')->whereNotNull('weight')->pluck('weight');

        return Inertia::render('customer/products', [
            'products' => $products,
            'filters'  => (object) $request->only(['search', 'city', 'brand', 'weight', 'min_price', 'max_price', 'sort']),
            'cities'   => $cities,
            'brands'   => $brands,
            'weights'  => $weights,
        ]);
    }
}
