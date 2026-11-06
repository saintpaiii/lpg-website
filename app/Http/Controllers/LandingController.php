<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Product;
use App\Models\Store;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Http\RedirectResponse;

class LandingController extends Controller
{
    public function index(Request $request): Response|RedirectResponse
    {
        // Redirect already-authenticated users to their respective dashboards
        if ($user = $request->user()) {
            $known = ['platform_staff', 'platform_admin', 'admin', 'manager', 'seller', 'seller_staff', 'cashier', 'warehouse', 'rider', 'customer'];
            if (in_array($user->role, $known, true)) {
                return redirect($user->homeUrl());
            }
        }

        // Products of stores customers can see — Featured stores (Premium plan / trial) first
        $products = Product::where('is_active', true)
            ->whereHas('store', fn ($q) => $q->visibleToCustomers())
            ->with('store:id,is_featured')
            ->orderByDesc(Store::select('is_featured')->whereColumn('stores.id', 'products.store_id')->limit(1))
            ->orderBy('weight_kg')
            ->get(['id', 'name', 'brand', 'weight_kg', 'selling_price', 'store_id'])
            ->map(fn (Product $p) => [
                'id'             => $p->id,
                'name'           => $p->name,
                'brand'          => $p->brand,
                'weight_kg'      => $p->weight_kg,
                'selling_price'  => $p->selling_price,
                'store_featured' => (bool) $p->store?->is_featured,
            ])
            ->values();

        $stats = [
            'stores'     => max(Store::count(), 2),
            'products'   => max(Product::where('is_active', true)->count(), 5),
            'deliveries' => max(Delivery::where('status', 'delivered')->count(), 10),
            'customers'  => max(Customer::count(), 20),
        ];

        return Inertia::render('landing', [
            'products' => $products,
            'stats'    => $stats,
            // Pricing section
            'plans'    => \App\Services\SubscriptionService::publicPlans(),
        ]);
    }
}
