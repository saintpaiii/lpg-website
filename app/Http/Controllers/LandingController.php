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
            $redirect = match (true) {
                $user->role === 'platform_staff'
                    => redirect($user->platformStaffHomeUrl()),

                in_array($user->role, ['platform_admin', 'admin', 'manager'])
                    => redirect()->route('admin.dashboard'),

                $user->role === 'seller'
                    => redirect()->route('seller.dashboard'),

                $user->role === 'seller_staff' && $user->sub_role === 'rider'
                    => redirect()->route('rider.deliveries'),

                $user->role === 'seller_staff' && $user->sub_role === 'warehouse'
                    => redirect()->route('seller.inventory'),

                $user->role === 'seller_staff'
                    => redirect()->route('seller.invoices'),

                $user->role === 'cashier'
                    => redirect()->route('admin.invoices'),

                $user->role === 'warehouse'
                    => redirect()->route('admin.dashboard'),

                $user->role === 'rider'
                    => redirect()->route('rider.deliveries'),

                $user->role === 'customer'
                    => redirect()->route('customer.dashboard'),

                default => null,
            };
            if ($redirect) return $redirect;
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
