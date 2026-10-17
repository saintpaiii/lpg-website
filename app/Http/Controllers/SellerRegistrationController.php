<?php

namespace App\Http\Controllers;

use App\Rules\InServiceArea;
use App\Models\Setting;
use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Services\LegalService;
use App\Support\StoreDocuments;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class SellerRegistrationController extends Controller
{
    /** GET /seller/register */
    public function create(): Response|RedirectResponse
    {
        if (auth()->check()) {
            return redirect()->route('home');
        }

        return Inertia::render('auth/seller-register', LegalService::sellerTermsProps());
    }

    /** POST /seller/register */
    public function store(Request $request): RedirectResponse
    {
        $fileRule = fn () => File::types(['jpg', 'jpeg', 'png', 'pdf'])->max(5 * 1024);

        $validated = $request->validate([
            // Owner account
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone'                 => ['required', 'string', 'regex:/^09\d{9}$/'],
            'password'              => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],

            // Store info
            'store_name'            => ['required', 'string', 'max:255'],
            'store_description'     => ['nullable', 'string', 'max:1000'],
            'store_address'         => ['required', 'string', 'max:500'],
            'store_city'            => ['required', 'string', 'max:100'],
            'store_barangay'        => ['required', 'string', 'max:100'],
            'store_province'        => ['required', 'string', 'max:100'],

            // Document uploads
            'valid_id'              => ['required', $fileRule()],
            'bir_permit'            => ['required', $fileRule()],
            'business_permit'       => ['required', $fileRule()],
            'fsic_permit'           => ['required', $fileRule()],
            'doe_lpg_license'       => ['required', $fileRule()],
            'lto_permit'            => ['required', $fileRule()],

            // Optional store logo (same rule as Seller Settings)
            'logo'                  => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],

            // Store pin (required — delivery fees and staff clock-in use it)
            'latitude'              => ['required', 'numeric', 'between:-90,90', new InServiceArea('longitude')],
            'longitude'             => ['required', 'numeric', 'between:-180,180'],

            // Permit "Valid until" dates
            ...StoreDocuments::expiryRules(),

            // Terms agreement
            'terms_agreed'          => ['required', 'accepted'],
        ], StoreDocuments::expiryMessages() + ['latitude.required' => "Please pin your store's location on the map.", 'longitude.required' => "Please pin your store's location on the map."]);

        DB::transaction(function () use ($request, $validated) {
            // Store uploaded documents — private ('local' disk, served only to the owner and reviewers)
            $validIdPath        = $request->file('valid_id')->store('valid_ids', 'local');
            $birPermitPath      = $request->file('bir_permit')->store('bir_permits', 'local');
            $businessPermitPath = $request->file('business_permit')->store('business_permits', 'local');
            $fsicPermitPath     = $request->file('fsic_permit')->store('fsic_permits', 'local');
            $doeLicensePath     = $request->file('doe_lpg_license')->store('doe_licenses', 'local');
            $ltoPermitPath      = $request->file('lto_permit')->store('lto_permits', 'local');
            // The logo is public (customers see it)
            $logoPath           = $request->hasFile('logo') ? $request->file('logo')->store('store-logos', 'public') : null;

            // Create seller user account (email unverified)
            $user = User::create([
                'name'        => $validated['name'],
                'email'       => $validated['email'],
                'password'    => Hash::make($validated['password']),
                'phone'       => $validated['phone'],
                'role'        => 'seller',
                'is_active'   => true,
                'valid_id'    => $validIdPath,
                'id_verified' => false,
            ]);

            // Create store (pending approval)
            $store = Store::create([
                'user_id'          => $user->id,
                'store_name'       => $validated['store_name'],
                'description'      => $validated['store_description'] ?? null,
                'address'          => $validated['store_address'],
                'city'             => $validated['store_city'],
                'barangay'         => $validated['store_barangay'],
                'province'         => $validated['store_province'],
                'phone'            => $validated['phone'],
                'email'            => $validated['email'],
                'bir_permit'       => $birPermitPath,
                'business_permit'  => $businessPermitPath,
                'fsic_permit'      => $fsicPermitPath,
                'doe_lpg_license'  => $doeLicensePath,
                'lto_permit'       => $ltoPermitPath,
                'logo'             => $logoPath,
                'latitude'         => $validated['latitude'],
                'longitude'        => $validated['longitude'],
                'business_permit_expires_at' => $validated['business_permit_expires_at'],
                'fsic_permit_expires_at'     => $validated['fsic_permit_expires_at'],
                'doe_lpg_license_expires_at' => $validated['doe_lpg_license_expires_at'],
                'lto_permit_expires_at'      => $validated['lto_permit_expires_at'],
                'status'           => 'pending',
                'subscription_plan'=> 'free',
                'commission_rate'  => (float) Setting::get('default_commission_rate', 5.00),   // the rate the seller agreed to
                'is_featured'      => false,
            ]);

            // Link seller user to their store
            $user->update(['store_id' => $store->id]);

            // Create verification request for platform admin review
            VerificationRequest::create([
                'user_id'              => $user->id,
                'type'                 => 'seller_application',
                'valid_id_path'        => $validIdPath,
                'bir_permit_path'      => $birPermitPath,
                'business_permit_path' => $businessPermitPath,
                'fsic_permit_path'     => $fsicPermitPath,
                'doe_lpg_license_path' => $doeLicensePath,
                'lto_permit_path'      => $ltoPermitPath,
                'status'               => 'pending',
                'terms_agreed_at'      => now(),
            ]);

            // Proof of agreement to the current Seller Terms + Privacy Policy
            LegalService::accept($user, LegalService::currentIds(['seller_terms', 'privacy_policy']), 'seller_application', $request);

            // Email is verified with a 6-digit code on /verify-otp (no link email)
        });

        NotificationService::sendToRole(
            'admin',
            'system',
            'New seller application',
            "{$validated['name']} submitted a seller application for \"{$validated['store_name']}\".",
            []
        );

        return redirect()->route('seller.pending');
    }
}
