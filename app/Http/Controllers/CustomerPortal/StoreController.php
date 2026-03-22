<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\Rating;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class StoreController extends Controller
{
    public function show(Request $request, Store $store): Response
    {
        if ($store->status !== 'approved') {
            abort(404);
        }

        $search = $request->get('search', '');

        $query = Product::with(['inventory'])
            ->withAvg('ratings', 'rating')
            ->withCount('ratings')
            ->where('store_id', $store->id)
            ->where('is_active', true)
            ->whereNotNull('refill_price');

        if ($search) {
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('brand', 'like', "%{$search}%")
            );
        }

        $products = $query->latest()->paginate(20)->withQueryString()->through(fn ($p) => [
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
            'avg_rating'     => round((float) ($p->ratings_avg_rating ?? 0), 1),
            'review_count'   => (int) ($p->ratings_count ?? 0),
        ]);

        $avgRating        = round((float) (Rating::where('store_id', $store->id)->avg('rating') ?? 0), 1);
        $totalReviews     = Rating::where('store_id', $store->id)->count();
        $completedOrders  = Order::where('store_id', $store->id)->where('status', 'delivered')->count();
        $activeProducts   = Product::where('store_id', $store->id)->where('is_active', true)->count();

        $recentReviews = Rating::where('store_id', $store->id)
            ->with(['user', 'product'])
            ->orderByDesc('created_at')
            ->take(20)
            ->get()
            ->map(fn ($r) => [
                'id'            => $r->id,
                'rating'        => $r->rating,
                'review'        => $r->review,
                'customer_name' => $r->user?->name ?? 'Customer',
                'product_name'  => $r->product?->name ?? '',
                'created_at'    => $r->created_at->format('M d, Y'),
            ]);

        return Inertia::render('customer/store', [
            'store' => [
                'id'            => $store->id,
                'store_name'    => $store->store_name,
                'description'   => $store->description,
                'city'          => $store->city,
                'barangay'      => $store->barangay,
                'province'      => $store->province,
                'phone'         => $store->phone,
                'avg_rating'    => $avgRating,
                'review_count'  => $totalReviews,
                'product_count' => $activeProducts,
                'order_count'   => $completedOrders,
                'joined_at'     => $store->created_at->format('M Y'),
                'is_top_rated'  => $avgRating >= 4.5 && $totalReviews >= 5,
                'is_trusted'    => $completedOrders >= 50,
            ],
            'products'       => $products,
            'recent_reviews' => $recentReviews,
            'search'         => $search,
        ]);
    }
}
