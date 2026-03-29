<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\VerificationRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Inertia\Inertia;
use Inertia\Response;

class BecomeSellerController extends Controller
{
    /** GET /customer/become-seller */
    public function create(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        // Already approved as seller — send to seller dashboard
        if ($user->role === 'seller') {
            return redirect('/seller/dashboard');
        }

        // Latest seller application for this user
        $application = VerificationRequest::where('user_id', $user->id)
            ->where('type', 'seller_application')
            ->latest()
            ->first();

        $previousStore = null;
        $previousDocs  = null;

        if ($application?->status === 'rejected') {
            $store = Store::where('user_id', $user->id)->first();
            if ($store) {
                $previousStore = [
                    'store_name'  => $store->store_name,
                    'description' => $store->description,
                    'address'     => $store->address,
                    'city'        => $store->city,
                    'barangay'    => $store->barangay,
                    'province'    => $store->province,
                    'phone'       => $store->phone,
                ];
            }
            $previousDocs = [
                'valid_id_url'        => $application->valid_id_path ? Storage::url($application->valid_id_path) : null,
                'bir_permit_url'      => $application->bir_permit_path ? Storage::url($application->bir_permit_path) : null,
                'business_permit_url' => $application->business_permit_path ? Storage::url($application->business_permit_path) : null,
                'fsic_permit_url'     => $application->fsic_permit_path ? Storage::url($application->fsic_permit_path) : null,
                'doe_lpg_license_url' => $application->doe_lpg_license_path ? Storage::url($application->doe_lpg_license_path) : null,
                'lto_permit_url'      => $application->lto_permit_path ? Storage::url($application->lto_permit_path) : null,
            ];
        }

        return Inertia::render('customer/become-seller', [
            'application' => $application ? [
                'status'           => $application->status,
                'rejection_reason' => $application->rejection_reason,
                'created_at'       => $application->created_at->format('M d, Y'),
            ] : null,
            'has_valid_id'   => (bool) $user->valid_id,
            'previous_store' => $previousStore,
            'previous_docs'  => $previousDocs,
        ]);
    }

    /** POST /customer/become-seller */
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->role === 'seller') {
            return redirect('/seller/dashboard');
        }

        // Load existing rejected application for resubmission fallback
        $existingApp = VerificationRequest::where('user_id', $user->id)
            ->where('type', 'seller_application')
            ->where('status', 'rejected')
            ->latest()
            ->first();

        $isResubmission = $existingApp !== null;
        $fileRule       = fn () => File::types(['jpg', 'jpeg', 'png', 'pdf'])->max(5 * 1024);
        // On resubmission, each doc is optional — fallback to existing path below
        $docRule        = fn () => $isResubmission ? ['nullable', $fileRule()] : ['required', $fileRule()];

        $request->validate([
            'store_name'        => ['required', 'string', 'max:255'],
            'store_description' => ['nullable', 'string', 'max:1000'],
            'store_address'     => ['required', 'string', 'max:500'],
            'store_city'        => ['required', 'string', 'max:100'],
            'store_barangay'    => ['required', 'string', 'max:100'],
            'store_province'    => ['required', 'string', 'max:100'],
            'store_phone'       => ['required', 'string', 'max:20'],
            'bir_permit'        => $docRule(),
            'business_permit'   => $docRule(),
            'valid_id'          => ['nullable', $fileRule()],
            'fsic_permit'       => $docRule(),
            'doe_lpg_license'   => $docRule(),
            'lto_permit'        => $docRule(),
            'terms_agreed'      => ['required', 'accepted'],
        ]);

        // Use new upload or fall back to existing path from rejected application
        $birPermitPath      = $request->hasFile('bir_permit')
            ? $request->file('bir_permit')->store('bir_permits', 'public')
            : $existingApp?->bir_permit_path;
        $businessPermitPath = $request->hasFile('business_permit')
            ? $request->file('business_permit')->store('business_permits', 'public')
            : $existingApp?->business_permit_path;
        $fsicPermitPath     = $request->hasFile('fsic_permit')
            ? $request->file('fsic_permit')->store('fsic_permits', 'public')
            : $existingApp?->fsic_permit_path;
        $doeLicensePath     = $request->hasFile('doe_lpg_license')
            ? $request->file('doe_lpg_license')->store('doe_licenses', 'public')
            : $existingApp?->doe_lpg_license_path;
        $ltoPermitPath      = $request->hasFile('lto_permit')
            ? $request->file('lto_permit')->store('lto_permits', 'public')
            : $existingApp?->lto_permit_path;

        // Reuse existing valid_id if not re-uploading
        $validIdPath = $request->hasFile('valid_id')
            ? $request->file('valid_id')->store('valid_ids', 'public')
            : $user->valid_id;

        // Create or reset store for this user
        $store = Store::updateOrCreate(
            ['user_id' => $user->id],
            [
                'store_name'      => $request->store_name,
                'description'     => $request->store_description,
                'address'         => $request->store_address,
                'city'            => $request->store_city,
                'barangay'        => $request->store_barangay,
                'province'        => $request->store_province,
                'phone'           => $request->store_phone,
                'bir_permit'      => $birPermitPath,
                'business_permit' => $businessPermitPath,
                'fsic_permit'     => $fsicPermitPath,
                'doe_lpg_license' => $doeLicensePath,
                'lto_permit'      => $ltoPermitPath,
                'status'          => 'pending',
                'commission_rate' => 5.00,
            ]
        );

        // Link user to store
        $user->update(['store_id' => $store->id]);

        // Soft-delete any prior rejected application, then create a fresh one
        VerificationRequest::where('user_id', $user->id)
            ->where('type', 'seller_application')
            ->where('status', 'rejected')
            ->delete();

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

        return redirect('/customer/become-seller')
            ->with('success', 'Your seller application has been submitted. We will review it within 1–3 business days.');
    }
}
