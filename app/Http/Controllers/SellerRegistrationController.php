<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
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

        return Inertia::render('auth/seller-register');
    }

    /** POST /seller/register */
    public function store(Request $request): RedirectResponse
    {
        $fileRule = fn () => File::types(['jpg', 'jpeg', 'png', 'pdf'])->max(5 * 1024);

        $validated = $request->validate([
            // Owner account
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone'                 => ['required', 'string', 'max:20'],
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

            // Terms agreement
            'terms_agreed'          => ['required', 'accepted'],
        ]);

        DB::transaction(function () use ($request, $validated) {
            // Store uploaded documents
            $validIdPath        = $request->file('valid_id')->store('valid_ids', 'public');
            $birPermitPath      = $request->file('bir_permit')->store('bir_permits', 'public');
            $businessPermitPath = $request->file('business_permit')->store('business_permits', 'public');
            $fsicPermitPath     = $request->file('fsic_permit')->store('fsic_permits', 'public');
            $doeLicensePath     = $request->file('doe_lpg_license')->store('doe_licenses', 'public');
            $ltoPermitPath      = $request->file('lto_permit')->store('lto_permits', 'public');

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
                'status'           => 'pending',
                'subscription_plan'=> 'free',
                'commission_rate'  => 5.00,
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

            // Send email verification
            $user->sendEmailVerificationNotification();
        });

        return redirect()->route('seller.pending');
    }
}
