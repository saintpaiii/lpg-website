<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class SettingsController extends Controller
{
    public function index(): Response
    {
        $store = request()->attributes->get('seller_store');

        return Inertia::render('seller/settings', [
            'store' => [
                'id'          => $store->id,
                'store_name'  => $store->store_name,
                'description' => $store->description,
                'address'     => $store->address,
                'city'        => $store->city,
                'barangay'    => $store->barangay,
                'province'    => $store->province,
                'phone'       => $store->phone,
                'email'       => $store->email,
                'logo_url'    => $store->logo ? Storage::url($store->logo) : null,
                'commission_rate'  => (float) $store->commission_rate,
                'delivery_fee'    => (float) ($store->delivery_fee ?? 0),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'store_name'  => 'required|string|max:255',
            'description' => 'nullable|string|max:1000',
            'address'     => 'required|string|max:255',
            'city'        => 'required|string|max:100',
            'barangay'    => 'nullable|string|max:100',
            'province'    => 'required|string|max:100',
            'phone'        => 'nullable|string|max:20',
            'email'        => 'nullable|email|max:255',
            'delivery_fee' => 'nullable|numeric|min:0|max:9999.99',
            'logo'         => 'nullable|image|mimes:jpg,jpeg,png|max:2048',
        ]);

        $updates = [
            'store_name'  => $data['store_name'],
            'description' => $data['description'] ?? null,
            'address'     => $data['address'],
            'city'        => $data['city'],
            'barangay'    => $data['barangay'] ?? null,
            'province'    => $data['province'],
            'phone'        => $data['phone'] ?? null,
            'email'        => $data['email'] ?? null,
            'delivery_fee' => $data['delivery_fee'] ?? 0,
        ];

        if ($request->hasFile('logo')) {
            if ($store->logo) {
                Storage::disk('public')->delete($store->logo);
            }
            $updates['logo'] = $request->file('logo')->store('store-logos', 'public');
        }

        $store->update($updates);

        return back()->with('success', 'Settings saved successfully.');
    }
}
