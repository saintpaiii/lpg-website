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

        return Inertia::render('customer/become-seller', [
            'application' => $application ? [
                'status'           => $application->status,
                'rejection_reason' => $application->rejection_reason,
                'created_at'       => $application->created_at->format('M d, Y'),
            ] : null,
            'has_valid_id' => (bool) $user->valid_id,
        ]);
    }

    /** POST /customer/become-seller */
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->role === 'seller') {
            return redirect('/seller/dashboard');
        }

        $fileRule = fn () => File::types(['jpg', 'jpeg', 'png', 'pdf'])->max(5 * 1024);

        $request->validate([
            'store_name'        => ['required', 'string', 'max:255'],
            'store_description' => ['nullable', 'string', 'max:1000'],
            'store_address'     => ['required', 'string', 'max:500'],
            'store_city'        => ['required', 'string', 'max:100'],
            'store_barangay'    => ['required', 'string', 'max:100'],
            'store_province'    => ['required', 'string', 'max:100'],
            'store_phone'       => ['required', 'string', 'max:20'],
            'bir_permit'        => ['required', $fileRule()],
            'business_permit'   => ['required', $fileRule()],
            'valid_id'          => ['nullable', $fileRule()],
            'fsic_permit'       => ['required', $fileRule()],
            'doe_lpg_license'   => ['required', $fileRule()],
            'lto_permit'        => ['required', $fileRule()],
            'terms_agreed'      => ['required', 'accepted'],
        ]);

        $birPermitPath      = $request->file('bir_permit')->store('bir_permits', 'public');
        $businessPermitPath = $request->file('business_permit')->store('business_permits', 'public');
        $fsicPermitPath     = $request->file('fsic_permit')->store('fsic_permits', 'public');
        $doeLicensePath     = $request->file('doe_lpg_license')->store('doe_licenses', 'public');
        $ltoPermitPath      = $request->file('lto_permit')->store('lto_permits', 'public');

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
