<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        $query = Customer::query();

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('barangay', 'like', "%{$search}%");
            });
        }

        if ($type = $request->input('type')) {
            $query->where('customer_type', $type);
        }

        $customers = $query
            ->withCount('orders')
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('rider/customers', [
            'customers' => $customers,
            'filters'   => $request->only('search', 'type'),
        ]);
    }

    public function orders(Customer $customer): Response
    {
        $orders = $customer->orders()
            ->with('items.product')
            ->latest()
            ->paginate(10);

        return Inertia::render('rider/customer-orders', [
            'customer' => $customer,
            'orders'   => $orders,
        ]);
    }
}
