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
                'id'                => $store->id,
                'store_name'        => $store->store_name,
                'description'       => $store->description,
                'address'           => $store->address,
                'city'              => $store->city,
                'barangay'          => $store->barangay,
                'province'          => $store->province,
                'phone'             => $store->phone,
                'email'             => $store->email,
                'logo_url'          => $store->logo ? Storage::url($store->logo) : null,
                'commission_rate'   => (float) $store->commission_rate,
                'delivery_fee'             => (float) ($store->delivery_fee ?? 0),
                'base_delivery_fee'        => (float) ($store->base_delivery_fee ?? 45),
                'fee_per_km'               => (float) ($store->fee_per_km ?? 10),
                'max_delivery_radius_km'   => (int) ($store->max_delivery_radius_km ?? 20),
                'latitude'                 => $store->latitude ? (float) $store->latitude : null,
                'longitude'                => $store->longitude ? (float) $store->longitude : null,
                'attendance_radius'        => $store->attendance_radius ?? 500,
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'store_name'        => 'required|string|max:255',
            'description'       => 'nullable|string|max:1000',
            'address'           => 'required|string|max:255',
            'city'              => 'required|string|max:100',
            'barangay'          => 'nullable|string|max:100',
            'province'          => 'required|string|max:100',
            'phone'             => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'email'             => 'nullable|email|max:255',
            'delivery_fee'             => 'nullable|numeric|min:0|max:9999.99',
            'base_delivery_fee'        => 'nullable|numeric|min:0|max:9999.99',
            'fee_per_km'               => 'nullable|numeric|min:0|max:999.99',
            'max_delivery_radius_km'   => 'nullable|integer|min:1|max:200',
            'logo'                     => 'nullable|image|mimes:jpg,jpeg,png|max:2048',
            'latitude'          => 'nullable|numeric|between:-90,90',
            'longitude'         => 'nullable|numeric|between:-180,180',
            'attendance_radius' => 'nullable|integer|min:50|max:5000',
        ]);

        $updates = [
            'store_name'        => $data['store_name'],
            'description'       => $data['description'] ?? null,
            'address'           => $data['address'],
            'city'              => $data['city'],
            'barangay'          => $data['barangay'] ?? null,
            'province'          => $data['province'],
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'delivery_fee'             => $data['delivery_fee'] ?? 0,
            'base_delivery_fee'        => $data['base_delivery_fee'] ?? 45,
            'fee_per_km'               => $data['fee_per_km'] ?? 10,
            'max_delivery_radius_km'   => $data['max_delivery_radius_km'] ?? 20,
            'latitude'                 => $data['latitude'] ?? null,
            'longitude'         => $data['longitude'] ?? null,
            'attendance_radius' => $data['attendance_radius'] ?? 500,
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
