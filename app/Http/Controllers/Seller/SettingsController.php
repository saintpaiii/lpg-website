<?php

namespace App\Http\Controllers\Seller;

use App\Rules\InServiceArea;
use App\Http\Controllers\Controller;
use App\Services\InvoiceService;
use App\Services\DuplicateStoreService;
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
                // Delivery fees are per vehicle type (Vehicles page)
                'can_deliver'              => \App\Services\DeliveryFeeService::clientOptions($store) !== [],
                'max_delivery_radius_km'   => (int) ($store->max_delivery_radius_km ?? 20),
                'latitude'                 => $store->latitude ? (float) $store->latitude : null,
                'longitude'                => $store->longitude ? (float) $store->longitude : null,
                'attendance_radius'        => $store->attendance_radius ?? 500,
                'allow_cod'                => (bool) ($store->allow_cod ?? true),
                'allow_pickup'             => (bool) $store->allow_pickup,
                'pickup_instructions'      => $store->pickup_instructions ?? '',
            ],
            // Tax & Invoice card (owner edits; staff with Settings see it read-only)
            'tax' => [
                'vat_status'         => $store->vat_status === 'vat' ? 'vat' : 'non_vat',
                'tin'                => $store->tin ?? '',
                'registered_name'    => $store->registered_name ?? '',
                'registered_address' => $store->registered_address ?? '',
                'invoice_prefix'     => $store->invoice_prefix ?? '',
                'next_number'        => InvoiceService::nextNumber($store),
                'prefix_locked'      => InvoiceService::prefixLocked($store),
                'store_address'      => InvoiceService::storeAddress($store),
            ],
            'can_edit_tax' => auth()->user()->role === 'seller',
            'refund_window_days' => (int) ($store->refund_window_days ?? 7),
        ]);
    }

    /** Settings → Refunds: days after delivery a customer can request a refund (new orders snapshot it). */
    public function updateRefunds(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'refund_window_days' => 'required|integer|min:1|max:90',
        ], [
            'refund_window_days.required' => 'Between 1 and 90 days.',
            'refund_window_days.integer'  => 'Between 1 and 90 days.',
            'refund_window_days.min'      => 'Between 1 and 90 days.',
            'refund_window_days.max'      => 'Between 1 and 90 days.',
        ]);

        $store->update(['refund_window_days' => (int) $data['refund_window_days']]);

        return back()->with('success', "Refund window saved: {$data['refund_window_days']} day" . ((int) $data['refund_window_days'] === 1 ? '' : 's') . ' after delivery.');
    }

    /** Settings → Tax & Invoice (owner only — route middleware seller_owner). */
    public function updateTax(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $request->merge([
            'invoice_prefix' => strtoupper(trim((string) $request->input('invoice_prefix'))),
            'tin'            => trim((string) $request->input('tin')) ?: null,
        ]);
        $locked  = InvoiceService::prefixLocked($store);
        $changed = $request->input('invoice_prefix') !== (string) $store->invoice_prefix;

        $rules = [
            'vat_status'         => ['required', 'in:vat,non_vat'],
            'tin'                => ['nullable', 'required_if:vat_status,vat', 'regex:/^\d{3}-\d{3}-\d{3}-\d{3,5}$/'],
            'registered_name'    => ['nullable', 'string', 'max:255'],
            'registered_address' => ['nullable', 'string', 'max:500'],
        ];
        // The code is checked only when it changed (a backfilled code like "SG2" saves untouched)
        if ($changed && ! $locked) {
            $rules['invoice_prefix'] = ['required', 'regex:/^[A-Z][A-Z0-9]{1,4}$/', 'not_in:INV',
                \Illuminate\Validation\Rule::unique('stores', 'invoice_prefix')->ignore($store->id)];
        }

        $data = $request->validate($rules, [
            'tin.required_if'          => 'Enter your TIN — required for VAT-registered stores.',
            'tin.regex'                => 'Use the format 000-000-000-00000.',
            'invoice_prefix.required'  => 'Enter an invoice code.',
            'invoice_prefix.regex'     => '2–5 letters or digits, starting with a letter (e.g. PGC).',
            'invoice_prefix.not_in'    => '"INV" is reserved — choose another code.',
            'invoice_prefix.unique'    => 'Another store already uses this code.',
        ]);

        $updates = [
            'vat_status'         => $data['vat_status'],
            'tin'                => $data['tin'] ?? null,
            'registered_name'    => ($data['registered_name'] ?? null) ?: null,
            'registered_address' => ($data['registered_address'] ?? null) ?: null,
        ];
        if (isset($rules['invoice_prefix'])) {
            $updates['invoice_prefix'] = $data['invoice_prefix'];
        }
        $store->update($updates);

        return back()->with('success', 'Tax & invoice settings saved.');
    }

    public function update(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'store_name'        => 'required|string|max:255',
            'description'       => 'nullable|string|max:1000',
            'address'           => 'required|string|max:255',
            'city'              => 'required|string|max:100',
            // NOT NULL columns → required (saving them empty used to give a 500)
            'barangay'          => 'required|string|max:100',
            'province'          => 'required|string|max:100',
            'phone'             => ['required', 'string', 'regex:/^09\d{9}$/'],
            'email'             => 'nullable|email|max:255',
            'max_delivery_radius_km'   => 'nullable|integer|min:1|max:200',
            'logo'                     => 'nullable|image|mimes:jpg,jpeg,png,webp|max:2048',
            // The store pin is required (delivery fees and staff clock-in use it); it can be moved, not removed
            'latitude'          => ['required', 'numeric', 'between:-90,90', new InServiceArea('longitude')],
            'longitude'         => 'required|numeric|between:-180,180',
            'attendance_radius' => 'nullable|integer|min:50|max:5000',
            'allow_cod'                => 'nullable|boolean',
            'allow_pickup'             => 'nullable|boolean',
            'pickup_instructions'      => 'nullable|string|max:255',
        ], [
            'latitude.required'  => "Please pin your store's location on the map.",
            'longitude.required' => "Please pin your store's location on the map.",
            'barangay.required'  => "Enter the store's barangay.",
            'phone.required'     => "Enter the store's phone number (09XXXXXXXXX).",
            'phone.regex'        => "Enter the store's phone number (09XXXXXXXXX).",
        ] + \App\Support\UploadMessages::for(['logo'], false));

        // Renamed or pin moved → duplicate check again: a true duplicate is refused, otherwise the admin's
        // "Possible duplicate" flags are refreshed
        $renamed = DuplicateStoreService::normalizeName($data['store_name']) !== DuplicateStoreService::normalizeName($store->store_name);
        $moved   = $store->latitude === null || $store->longitude === null
            || DuplicateStoreService::distanceMeters((float) $data['latitude'], (float) $data['longitude'], (float) $store->latitude, (float) $store->longitude) > 1;
        $duplicateFlags = $store->duplicate_flags;
        if ($renamed || $moved) {
            $dup = DuplicateStoreService::check([
                'store_name' => $data['store_name'],
                'address'    => $data['address'],
                'barangay'   => $data['barangay'] ?? null,
                'city'       => $data['city'],
                'latitude'   => $data['latitude'],
                'longitude'  => $data['longitude'],
                'phones'     => array_filter([$data['phone'] ?? null, $store->owner?->phone]),
                'hashes'     => (array) ($store->document_hashes ?? []),
            ], $store->id);
            if ($dup['block'] && $dup['block']['field'] === 'store_name') {
                throw \Illuminate\Validation\ValidationException::withMessages(['store_name' => $dup['block']['message']]);
            }
            $duplicateFlags = DuplicateStoreService::flags($dup);
        }

        $updates = [
            'duplicate_flags'   => $duplicateFlags,
            'store_name'        => $data['store_name'],
            'description'       => $data['description'] ?? null,
            'address'           => $data['address'],
            'city'              => $data['city'],
            'barangay'          => $data['barangay'] ?? null,
            'province'          => $data['province'],
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'max_delivery_radius_km'   => $data['max_delivery_radius_km'] ?? 20,
            'latitude'                 => $data['latitude'] ?? null,
            'longitude'         => $data['longitude'] ?? null,
            'attendance_radius' => $data['attendance_radius'] ?? 500,
            'allow_cod'                => $request->has('allow_cod') ? $request->boolean('allow_cod') : $store->allow_cod,
            // Consignment (allow / deadline) is edited on the Loyalty Program page
            'allow_pickup'             => $request->has('allow_pickup') ? $request->boolean('allow_pickup') : (bool) $store->allow_pickup,
            'pickup_instructions'      => $request->has('pickup_instructions') ? ($data['pickup_instructions'] ?? null) : $store->pickup_instructions,
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
