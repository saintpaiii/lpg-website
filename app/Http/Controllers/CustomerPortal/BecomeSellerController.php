<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\Store;
use App\Models\VerificationRequest;
use App\Services\LegalService;
use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
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
                    'logo_url'    => $store->logo ? Storage::url($store->logo) : null,
                    // Permit "Valid until" dates are pre-filled on resubmission (still required)
                    ...collect(StoreDocuments::expiringTypes())->mapWithKeys(fn ($t) => [
                        StoreDocuments::expiryColumn($t) => $store->{StoreDocuments::expiryColumn($t)}?->toDateString(),
                    ])->all(),
                    'province'    => $store->province,
                    'phone'       => $store->phone,
                ];
            }
            $previousDocs = [
                'valid_id_url'        => PrivateDocument::urlIf($application->valid_id_path, 'verification', $application->id, 'valid_id_path'),
                'bir_permit_url'      => PrivateDocument::urlIf($application->bir_permit_path, 'verification', $application->id, 'bir_permit_path'),
                'business_permit_url' => PrivateDocument::urlIf($application->business_permit_path, 'verification', $application->id, 'business_permit_path'),
                'fsic_permit_url'     => PrivateDocument::urlIf($application->fsic_permit_path, 'verification', $application->id, 'fsic_permit_path'),
                'doe_lpg_license_url' => PrivateDocument::urlIf($application->doe_lpg_license_path, 'verification', $application->id, 'doe_lpg_license_path'),
                'lto_permit_url'      => PrivateDocument::urlIf($application->lto_permit_path, 'verification', $application->id, 'lto_permit_path'),
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
            ...LegalService::sellerTermsProps(),
            // Max 5 rejected applications within 30 days
            'limit_message'  => $application?->status === 'pending' ? null : $this->limitMessage($user->id),
            'attempt'        => $this->rejectedRecently($user->id)->count() + 1,
            'max_attempts'   => StoreDocuments::MAX_REJECTIONS,
        ]);
    }

    /** POST /customer/become-seller */
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->role === 'seller') {
            return redirect('/seller/dashboard');
        }

        if ($message = $this->limitMessage($user->id)) {
            return back()->with('error', $message);
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
            'store_phone'       => ['required', 'string', 'regex:/^09\d{9}$/'],
            'bir_permit'        => $docRule(),
            'business_permit'   => $docRule(),
            'valid_id'          => ['nullable', $fileRule()],
            'fsic_permit'       => $docRule(),
            'doe_lpg_license'   => $docRule(),
            'lto_permit'        => $docRule(),
            'logo'              => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            ...StoreDocuments::expiryRules(),
            'terms_agreed'      => ['required', 'accepted'],
        ], StoreDocuments::expiryMessages());

        // Use new upload or fall back to existing path from rejected application
        $birPermitPath      = $request->hasFile('bir_permit')
            ? $request->file('bir_permit')->store('bir_permits', 'local')
            : $existingApp?->bir_permit_path;
        $businessPermitPath = $request->hasFile('business_permit')
            ? $request->file('business_permit')->store('business_permits', 'local')
            : $existingApp?->business_permit_path;
        $fsicPermitPath     = $request->hasFile('fsic_permit')
            ? $request->file('fsic_permit')->store('fsic_permits', 'local')
            : $existingApp?->fsic_permit_path;
        $doeLicensePath     = $request->hasFile('doe_lpg_license')
            ? $request->file('doe_lpg_license')->store('doe_licenses', 'local')
            : $existingApp?->doe_lpg_license_path;
        $ltoPermitPath      = $request->hasFile('lto_permit')
            ? $request->file('lto_permit')->store('lto_permits', 'local')
            : $existingApp?->lto_permit_path;

        // Reuse existing valid_id if not re-uploading
        $validIdPath = $request->hasFile('valid_id')
            ? $request->file('valid_id')->store('valid_ids', 'local')
            : $user->valid_id;

        // Logo is public; on resubmission the old one is kept unless a new one is uploaded
        $logoPath = $request->hasFile('logo')
            ? $request->file('logo')->store('store-logos', 'public')
            : Store::where('user_id', $user->id)->value('logo');

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
                'logo'            => $logoPath,
                'business_permit_expires_at' => $request->business_permit_expires_at,
                'fsic_permit_expires_at'     => $request->fsic_permit_expires_at,
                'doe_lpg_license_expires_at' => $request->doe_lpg_license_expires_at,
                'lto_permit_expires_at'      => $request->lto_permit_expires_at,
                'status'          => 'pending',
                'commission_rate' => (float) Setting::get('default_commission_rate', 5.00),   // the rate the seller agreed to
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

        // Proof of agreement to the current Seller Terms + Privacy Policy
        LegalService::accept($user, LegalService::currentIds(['seller_terms', 'privacy_policy']), 'seller_application', $request);

        return redirect('/customer/become-seller')
            ->with('success', 'Your seller application has been submitted. We will review it within 1–3 business days.');
    }

    /** Dates of this user's seller applications rejected in the last 30 days, newest first (soft-deleted ones included). */
    private function rejectedRecently(int $userId): \Illuminate\Support\Collection
    {
        return VerificationRequest::withTrashed()
            ->where('user_id', $userId)
            ->where('type', 'seller_application')
            ->where('status', 'rejected')
            ->whereRaw('COALESCE(reviewed_at, updated_at) >= ?', [now()->subDays(30)])
            ->get(['reviewed_at', 'updated_at'])
            ->map(fn ($v) => $v->reviewed_at ?? $v->updated_at)
            ->sortDesc()
            ->values();
    }

    /** The "too many attempts" message, or null when the user may apply. */
    private function limitMessage(int $userId): ?string
    {
        $rejected = $this->rejectedRecently($userId);
        if ($rejected->count() < StoreDocuments::MAX_REJECTIONS) {
            return null;
        }
        $until = $rejected[StoreDocuments::MAX_REJECTIONS - 1]->copy()->addDays(30)->timezone('Asia/Manila')->format('M d, Y');

        return "You've reached 5 applications in 30 days. Please try again after {$until} or contact the platform admin.";
    }
}
