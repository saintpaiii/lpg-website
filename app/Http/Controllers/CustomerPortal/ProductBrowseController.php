<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\Rating;
use App\Models\Store;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

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

    public function show(Request $request, int $id): Response|RedirectResponse
    {
        $product = Product::with(['store', 'inventory'])
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->where('id', $id)
            ->where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->first();

        if (! $product) {
            return redirect('/customer/products')->with('error', 'Product not found or no longer available.');
        }

        // Paginated reviews with reviewer name
        $reviews = Rating::with('user:id,name')
            ->where('product_id', $product->id)
            ->orderByDesc('created_at')
            ->paginate(10)
            ->through(fn ($r) => [
                'id'         => $r->id,
                'rating'     => $r->rating,
                'review'     => $r->review,
                'user_name'  => $r->user?->name ?? 'Anonymous',
                'created_at' => $r->created_at->format('M d, Y'),
            ]);

        // Can the current user rate this product?
        $canRate      = false;
        $ratingOrderId = null;
        if ($request->user()) {
            $customer = Customer::where('user_id', $request->user()->id)->first();
            if ($customer) {
                $alreadyRated = Rating::where('user_id', $request->user()->id)
                    ->where('product_id', $product->id)
                    ->exists();

                if (! $alreadyRated) {
                    $deliveredOrder = Order::where('customer_id', $customer->id)
                        ->where('status', 'delivered')
                        ->whereHas('items', fn ($q) => $q->where('product_id', $product->id))
                        ->first();

                    if ($deliveredOrder) {
                        $canRate       = true;
                        $ratingOrderId = $deliveredOrder->id;
                    }
                }
            }
        }

        // Related: more from same store (up to 4)
        $fromStore = Product::with('inventory')
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->where('store_id', $product->store_id)
            ->where('id', '!=', $product->id)
            ->where('is_active', true)
            ->limit(4)
            ->get()
            ->map(fn ($p) => $this->mapRelated($p));

        // Related: similar weight from other stores (up to 4)
        $similar = Product::with(['store', 'inventory'])
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->where('weight', $product->weight)
            ->where('store_id', '!=', $product->store_id)
            ->where('id', '!=', $product->id)
            ->where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->limit(4)
            ->get()
            ->map(fn ($p) => $this->mapRelated($p));

        return Inertia::render('customer/product-show', [
            'product' => [
                'id'             => $product->id,
                'name'           => $product->name,
                'brand'          => $product->brand,
                'weight'         => $product->weight,
                'weight_kg'      => (float) ($product->weight_kg ?? 0),
                'description'    => $product->description,
                'refill_price'   => (float) $product->refill_price,
                'purchase_price' => (float) ($product->purchase_price ?? $product->refill_price),
                'image_url'      => $product->image ? Storage::url($product->image) : null,
                'stock'          => $product->inventory?->quantity ?? 0,
                'store_id'       => $product->store_id,
                'store_name'     => $product->store?->store_name ?? '',
                'store_city'     => $product->store?->city ?? '',
                'store_barangay' => $product->store?->barangay ?? '',
                'delivery_fee'   => (float) ($product->store?->delivery_fee ?? 0),
                'avg_rating'     => round((float) ($product->ratings_avg_rating ?? 0), 1),
                'review_count'   => (int) ($product->ratings_count ?? 0),
            ],
            'reviews'        => $reviews,
            'canRate'        => $canRate,
            'ratingOrderId'  => $ratingOrderId,
            'fromStore'      => $fromStore->values()->all(),
            'similar'        => $similar->values()->all(),
        ]);
    }

    private function mapRelated(Product $p): array
    {
        return [
            'id'             => $p->id,
            'name'           => $p->name,
            'brand'          => $p->brand,
            'weight'         => $p->weight,
            'refill_price'   => (float) $p->refill_price,
            'purchase_price' => (float) ($p->purchase_price ?? $p->refill_price),
            'image_url'      => $p->image ? Storage::url($p->image) : null,
            'stock'          => $p->inventory?->quantity ?? 0,
            'store_name'     => $p->store?->store_name ?? '',
            'store_id'       => $p->store_id,
            'avg_rating'     => round((float) ($p->ratings_avg_rating ?? 0), 1),
            'review_count'   => (int) ($p->ratings_count ?? 0),
        ];
    }
}
