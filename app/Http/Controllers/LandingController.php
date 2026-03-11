<?php

namespace App\Http\Controllers;

use App\Models\Product;
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
            $redirect = match ($user->role) {
                'admin', 'manager' => redirect()->route('admin.dashboard'),
                'cashier'          => redirect()->route('admin.invoices'),
                'warehouse'        => redirect()->route('admin.inventory'),
                'rider'            => redirect()->route('rider.deliveries'),
                default            => null,
            };
            if ($redirect) return $redirect;
        }

        $products = Product::where('is_active', true)
            ->orderBy('weight_kg')
            ->get(['id', 'name', 'brand', 'weight_kg', 'selling_price']);

        return Inertia::render('landing', [
            'products' => $products,
        ]);
    }
}
