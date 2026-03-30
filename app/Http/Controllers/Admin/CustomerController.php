<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->input('tab', 'active'); // 'active' | 'archived'
        $search = $request->input('search');
        $type   = $request->input('type');

        $query = $tab === 'archived'
            ? Customer::onlyTrashed()
            : Customer::query();

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('barangay', 'like', "%{$search}%");
            });
        }

        if ($type) {
            $query->where('customer_type', $type);
        }

        $customers = $query
            ->withCount('orders')
            ->orderBy('name')
            ->paginate(15)
            ->withQueryString();

        $archivedCount = Customer::onlyTrashed()->count();

        return Inertia::render('admin/customers', [
            'customers'     => $customers,
            'filters'       => $request->only('search', 'type', 'tab'),
            'archivedCount' => $archivedCount,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:255',
            'address'       => 'nullable|string|max:500',
            'city'          => 'nullable|string|max:100',
            'barangay'      => 'nullable|string|max:100',
            'phone'         => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'email'         => 'nullable|email|max:255',
            'customer_type' => 'required|in:household,commercial,industrial',
            'notes'         => 'nullable|string|max:1000',
        ]);

        Customer::create($data);

        return back()->with('success', 'Customer created successfully.');
    }

    public function update(Request $request, Customer $customer): RedirectResponse
    {
        $data = $request->validate([
            'name'          => 'required|string|max:255',
            'address'       => 'nullable|string|max:500',
            'city'          => 'nullable|string|max:100',
            'barangay'      => 'nullable|string|max:100',
            'phone'         => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'email'         => 'nullable|email|max:255',
            'customer_type' => 'required|in:household,commercial,industrial',
            'notes'         => 'nullable|string|max:1000',
        ]);

        $customer->update($data);

        return back()->with('success', 'Customer updated successfully.');
    }

    public function destroy(Customer $customer): RedirectResponse
    {
        $customer->delete(); // soft delete — archives the record

        return back()->with('success', 'Customer archived successfully.');
    }

    public function restore(Customer $customer): RedirectResponse
    {
        $customer->restore();

        return back()->with('success', 'Customer restored successfully.');
    }

    public function forceDestroy(Customer $customer): RedirectResponse
    {
        $customer->forceDelete();

        return back()->with('success', 'Customer permanently deleted.');
    }

    public function orders(Customer $customer): Response
    {
        $orders = $customer->orders()
            ->with('items.product')
            ->latest()
            ->paginate(10);

        return Inertia::render('admin/customer-orders', [
            'customer' => $customer,
            'orders'   => $orders,
        ]);
    }
}
