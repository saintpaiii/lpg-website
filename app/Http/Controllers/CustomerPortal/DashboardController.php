<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $user     = $request->user();
        $customer = Customer::where('user_id', $user->id)->first();

        $stats = [
            'total_orders'  => 0,
            'active_orders' => 0,
            'last_order_at' => null,
        ];

        $activeOrder = null;

        if ($customer) {
            $orders = $customer->orders()->orderByDesc('created_at');

            $stats['total_orders']  = (clone $orders)->count();
            $stats['active_orders'] = (clone $orders)
                ->whereNotIn('status', ['delivered', 'cancelled'])
                ->count();
            $stats['last_order_at'] = (clone $orders)->value('created_at')?->format('M d, Y');

            $activeOrder = (clone $orders)
                ->with(['items.product', 'delivery.rider'])
                ->whereNotIn('status', ['delivered', 'cancelled'])
                ->first();

            if ($activeOrder) {
                $activeOrder = [
                    'id'           => $activeOrder->id,
                    'order_number' => $activeOrder->order_number,
                    'status'       => $activeOrder->status,
                    'total_amount' => (float) $activeOrder->total_amount,
                    'created_at'   => $activeOrder->created_at->format('M d, Y'),
                    'rider_name'   => $activeOrder->delivery?->rider?->name,
                ];
            }
        }

        // Featured products — recent active products from approved stores (up to 6)
        $featuredProducts = Product::with(['store', 'inventory'])
            ->where('is_active', true)
            ->whereHas('store', fn ($q) => $q->where('status', 'approved'))
            ->whereNotNull('refill_price')
            ->latest()
            ->limit(6)
            ->get()
            ->map(fn ($p) => [
                'id'             => $p->id,
                'name'           => $p->name,
                'brand'          => $p->brand,
                'weight'         => $p->weight,
                'refill_price'   => (float) $p->refill_price,
                'purchase_price' => (float) ($p->purchase_price ?? $p->refill_price),
                'image_url'      => $p->image ? Storage::url($p->image) : null,
                'stock'          => $p->inventory?->quantity ?? 0,
                'store_name'     => $p->store->store_name,
                'store_city'     => $p->store->city,
                'store_id'       => $p->store_id,
                'delivery_fee'   => (float) ($p->store->delivery_fee ?? 0),
            ]);

        return Inertia::render('customer/dashboard', [
            'customerName'          => $user->name,
            'stats'                 => $stats,
            'activeOrder'           => $activeOrder,
            'hasProfile'       => $customer !== null,
            'featuredProducts' => $featuredProducts,
        ]);
    }
}
