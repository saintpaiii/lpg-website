<?php

namespace App\Http\Controllers;

use App\Rules\InServiceArea;
use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Services\LegalService;
use App\Support\StoreDocuments;
use App\Services\FaceMatchService;
use App\Services\NotificationService;
use App\Services\DuplicateStoreService;
use Illuminate\Validation\ValidationException;
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

    /** GET /seller/register/check-name?name= — only {exists, count, cities}; the caller's own store is never counted. */
    public function checkName(Request $request): \Illuminate\Http\JsonResponse
    {
        $name = mb_substr(trim((string) $request->query('name', '')), 0, 255);
        $own  = $request->user() ? Store::where('user_id', $request->user()->id)->value('id') : null;

        return response()->json(DuplicateStoreService::nameSummary($name, $own));
    }

    /** POST /seller/register */
    public function store(Request $request): RedirectResponse|\Illuminate\Http\JsonResponse
    {
        $fileRule = fn () => File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024);

        $validated = $request->validate([
            // Owner account — name parts (the full name is built with User::composeName)
            'first_name'            => ['required', 'string', 'max:255'],
            'middle_name'           => ['nullable', 'string', 'max:255'],
            'last_name'             => ['required', 'string', 'max:255'],
            'suffix'                => ['nullable', 'in:' . implode(',', User::SUFFIXES)],
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
            // Owner's live-camera selfie (JPEG from the camera; the page has no file upload for it)
            'selfie'                => ['required', File::types(['jpg', 'jpeg', 'png', 'webp'])->max(5 * 1024)],
            'bir_permit'          => ['required', $fileRule()],
            'business_permit'       => ['required', $fileRule()],
            'fsic_permit'           => ['required', $fileRule()],
            'doe_lpg_license'       => ['required', $fileRule()],
            // DTI Business Name or SEC Registration (+ which one) — replaces the old LTO upload (the DOE license IS the LTO)
            'dti_sec_registration'  => ['required', $fileRule()],
            'dti_sec_kind'          => ['required', 'in:dti,sec'],

            // Optional store logo (same rule as Seller Settings)
            'logo'                  => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],

            // Store pin (required — delivery fees and staff clock-in use it)
            'latitude'              => ['required', 'numeric', 'between:-90,90', new InServiceArea('longitude')],
            'longitude'             => ['required', 'numeric', 'between:-180,180'],

            // Permit "Valid until" dates
            ...StoreDocuments::expiryRules(),

            // Optional extra documents (DTI, barangay clearance, store photo…) — reviewed in Store Documents
            ...StoreDocuments::otherDocumentRules(),

            // Terms agreement
            'terms_agreed'          => ['required', 'accepted'],
        ], StoreDocuments::expiryMessages() + StoreDocuments::otherDocumentMessages() + \App\Support\UploadMessages::for(['valid_id', 'bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'dti_sec_registration']) + StoreDocuments::dtiSecMessages() + \App\Support\UploadMessages::for(['logo'], false) + \App\Support\UploadMessages::for(['selfie'], false) + ['selfie.required' => 'Please take a selfie with your camera.'] + ['latitude.required' => "Please pin your store's location on the map.", 'longitude.required' => "Please pin your store's location on the map."]);

        $validated['suffix'] = ($validated['suffix'] ?? null) ?: null;
        $validated['name']   = User::composeName($validated['first_name'], $validated['middle_name'] ?? null, $validated['last_name'], $validated['suffix']);

        $otherRows = StoreDocuments::filledOtherRows($request);
        StoreDocuments::assertOtherRowsAllowed($otherRows);

        // Duplicate store? A true duplicate is refused; anything else is a warning (seller + admin)
        $hashes    = DuplicateStoreService::hashUploads($request);
        $duplicate = DuplicateStoreService::check([
            'store_name' => $validated['store_name'],
            'address'    => $validated['store_address'],
            'barangay'   => $validated['store_barangay'],
            'city'       => $validated['store_city'],
            'latitude'   => $validated['latitude'],
            'longitude'  => $validated['longitude'],
            'phones'     => [$validated['phone']],
            'hashes'     => $hashes,
        ]);
        if ($duplicate['block']) {
            throw ValidationException::withMessages([$duplicate['block']['field'] => $duplicate['block']['message']]);
        }

        $store = DB::transaction(function () use ($request, $validated, $otherRows, $hashes, $duplicate) {
            // Store uploaded documents — private ('local' disk, served only to the owner and reviewers)
            $validIdPath        = $request->file('valid_id')->store('valid_ids', 'local');
            $selfiePath         = $request->file('selfie')->store('verifications/selfies', 'local');   // same folder as customer selfies
            $birPermitPath      = $request->file('bir_permit')->store('bir_permits', 'local');
            $businessPermitPath = $request->file('business_permit')->store('business_permits', 'local');
            $fsicPermitPath     = $request->file('fsic_permit')->store('fsic_permits', 'local');
            $doeLicensePath     = $request->file('doe_lpg_license')->store('doe_licenses', 'local');
            $dtiSecPath         = $request->file('dti_sec_registration')->store('dti_sec_registrations', 'local');
            // The logo is public (customers see it)
            $logoPath           = $request->hasFile('logo') ? $request->file('logo')->store('store-logos', 'public') : null;

            // Create seller user account (email unverified)
            // Seller-only account: can_shop = false (no Customer Portal / orders). "Start Selling" keeps true.
            $user = User::create([
                'name'        => $validated['name'],
                'first_name'  => $validated['first_name'],
                'middle_name' => $validated['middle_name'] ?? null,
                'last_name'   => $validated['last_name'],
                'suffix'      => $validated['suffix'] ?? null,
                'email'       => $validated['email'],
                'password'    => Hash::make($validated['password']),
                'phone'       => $validated['phone'],
                'role'        => 'seller',
                'can_shop'    => false,
                'is_active'   => true,
                'valid_id'    => $validIdPath,
                'selfie_path' => $selfiePath,
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
                'dti_sec_registration' => $dtiSecPath,
                'dti_sec_kind'     => $validated['dti_sec_kind'],
                'logo'             => $logoPath,
                'latitude'         => $validated['latitude'],
                'longitude'        => $validated['longitude'],
                'business_permit_expires_at' => $validated['business_permit_expires_at'],
                'fsic_permit_expires_at'     => $validated['fsic_permit_expires_at'],
                'doe_lpg_license_expires_at' => $validated['doe_lpg_license_expires_at'],
                'status'           => 'pending',
                'subscription_plan'=> 'none',
                'is_featured'      => false,
                'document_hashes'  => $hashes ?: null,
                'duplicate_flags'  => DuplicateStoreService::flags($duplicate),
            ]);

            StoreDocuments::saveOtherDocuments($request, $store, $otherRows, $user->id);

            // Link seller user to their store
            $user->update(['store_id' => $store->id]);

            // Create verification request for platform admin review
            VerificationRequest::create([
                'user_id'              => $user->id,
                'type'                 => 'seller_application',
                'valid_id_path'        => $validIdPath,
                'selfie_path'          => $selfiePath,
                'bir_permit_path'      => $birPermitPath,
                'business_permit_path' => $businessPermitPath,
                'fsic_permit_path'     => $fsicPermitPath,
                'doe_lpg_license_path' => $doeLicensePath,
                'dti_sec_registration_path' => $dtiSecPath,
                'status'               => 'pending',
                'terms_agreed_at'      => now(),
            ]);

            // Proof of agreement to the current Seller Terms + Privacy Policy
            LegalService::accept($user, LegalService::currentIds(['seller_terms', 'privacy_policy']), 'seller_application', $request);

            // Email is verified with a 6-digit code on /verify-otp (no link email)

            return $store;
        });

        // Owner's ID vs live selfie (outside the transaction — up to ~15 s). The store still needs the admin's
        // approval; a pass ticks "Valid ID is clear and the name matches the owner" on the admin store page.
        if ($application = VerificationRequest::where('user_id', $store->user_id)->where('type', 'seller_application')->latest('id')->first()) {
            $face = FaceMatchService::compare(Storage::disk('local')->path($application->valid_id_path), Storage::disk('local')->path($application->selfie_path), 'ID');
            $application->update(FaceMatchService::columns($face));
        }

        NotificationService::sendToRole(
            'admin',
            'system',
            'New seller application',
            "{$validated['name']} submitted a seller application for \"{$validated['store_name']}\"."
                . ($duplicate['matches'] ? ' Possible duplicate — check the store page.' : ''),
            ['link' => "/admin/stores/{$store->id}", 'store_id' => $store->id]
        );

        // Not blocking: "same name elsewhere" / "another store within 50 m" — shown on the pending page
        if ($warning = DuplicateStoreService::sellerWarning($duplicate)) {
            session()->flash('warning', $warning);
        }

        // The page posts with axios: answer with JSON so the flash survives until it opens /seller/pending
        if ($request->wantsJson()) {
            return response()->json(['redirect' => route('seller.pending', absolute: false), 'warning' => $warning]);
        }

        return redirect()->route('seller.pending');
    }
}
