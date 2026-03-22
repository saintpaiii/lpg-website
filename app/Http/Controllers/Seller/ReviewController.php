<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Rating;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReviewController extends Controller
{
    public function index(Request $request): Response
    {
        $store     = request()->attributes->get('seller_store');
        $search    = $request->get('search', '');
        $productId = $request->get('product_id', '');

        $query = Rating::where('store_id', $store->id)
            ->with(['user', 'product'])
            ->orderByDesc('created_at');

        if ($search) {
            $query->whereHas('product', fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('brand', 'like', "%{$search}%")
            );
        }

        if ($productId) {
            $query->where('product_id', $productId);
        }

        $reviews = $query->paginate(20)->withQueryString()->through(fn ($r) => [
            'id'            => $r->id,
            'rating'        => $r->rating,
            'review'        => $r->review,
            'customer_name' => $r->user?->name ?? 'Customer',
            'product_name'  => $r->product?->name ?? '—',
            'product_brand' => $r->product?->brand ?? '',
            'created_at'    => $r->created_at->format('M d, Y'),
        ]);

        $total     = Rating::where('store_id', $store->id)->count();
        $avgRating = round((float) (Rating::where('store_id', $store->id)->avg('rating') ?? 0), 1);

        $breakdown = [];
        for ($i = 1; $i <= 5; $i++) {
            $breakdown[$i] = Rating::where('store_id', $store->id)->where('rating', $i)->count();
        }

        return Inertia::render('seller/reviews', [
            'reviews'   => $reviews,
            'avg'       => $avgRating,
            'total'     => $total,
            'breakdown' => $breakdown,
            'filters'   => ['search' => $search, 'product_id' => $productId],
        ]);
    }
}
