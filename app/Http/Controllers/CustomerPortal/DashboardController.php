<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
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

            // Most recent active order for status tracking
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

        return Inertia::render('customer/dashboard', [
            'customerName' => $user->name,
            'stats'        => $stats,
            'activeOrder'  => $activeOrder,
            'hasProfile'   => $customer !== null,
        ]);
    }
}
