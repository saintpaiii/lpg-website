<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Rules\InServiceArea;
use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\VerificationRequest;
use App\Services\LegalService;
use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
use App\Services\DuplicateStoreService;
use Illuminate\Support\Facades\DB;
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
                    'latitude'    => $store->latitude !== null ? (float) $store->latitude : null,
                    'longitude'   => $store->longitude !== null ? (float) $store->longitude : null,
                    // Permit "Valid until" dates are pre-filled on resubmission (still required)
                    ...collect(StoreDocuments::expiringTypes())->mapWithKeys(fn ($t) => [
                        StoreDocuments::expiryColumn($t) => $store->{StoreDocuments::expiryColumn($t)}?->toDateString(),
                    ])->all(),
                    'province'    => $store->province,
                    'phone'       => $store->phone,
                    'dti_sec_kind' => $store->dti_sec_kind,
                ];
            }
            $previousDocs = [
                // No valid_id_url: the application always uses the customer's verified ID (verified_id_url)
                'bir_permit_url'      => PrivateDocument::urlIf($application->bir_permit_path, 'verification', $application->id, 'bir_permit_path'),
                'business_permit_url' => PrivateDocument::urlIf($application->business_permit_path, 'verification', $application->id, 'business_permit_path'),
                'fsic_permit_url'     => PrivateDocument::urlIf($application->fsic_permit_path, 'verification', $application->id, 'fsic_permit_path'),
                'doe_lpg_license_url' => PrivateDocument::urlIf($application->doe_lpg_license_path, 'verification', $application->id, 'doe_lpg_license_path'),
                'dti_sec_registration_url' => PrivateDocument::urlIf($application->dti_sec_registration_path, 'verification', $application->id, 'dti_sec_registration_path'),
            ];
        }

        // Extra documents sent with an earlier application (shown read-only; new ones can be added)
        $ownStore     = Store::where('user_id', $user->id)->first();
        $previousOther = $ownStore
            ? \App\Models\StoreDocumentSubmission::where('store_id', $ownStore->id)->where('doc_type', 'other')->latest()->get()
                ->map(fn ($d) => [
                    'id'         => $d->id,
                    'label'      => $d->label ?? 'Other document',
                    'status'     => $d->status,
                    'expires_on' => $d->expires_at?->format('M d, Y'),
                    'url'        => PrivateDocument::url('store-document', $d->id, 'file_path'),
                ])->values()->all()
            : [];

        return Inertia::render('customer/become-seller', [
            'previous_other_docs' => $previousOther,
            // How many extra documents can still be added now (max 5 per form, 10 per store incl. earlier ones)
            'other_slots' => min(StoreDocuments::MAX_OTHER_AT_REGISTRATION,
                StoreDocuments::MAX_OTHER_TOTAL - ($ownStore ? StoreDocuments::otherCount($ownStore->id) : 0)),
            'application' => $application ? [
                'status'           => $application->status,
                'rejection_reason' => $application->rejection_reason,
                'created_at'       => $application->created_at->format('M d, Y'),
            ] : null,
            // The customer's verified ID is reused — Start Selling never asks for it again
            'has_valid_id'    => (bool) $user->verifiedIdPath(),
            'verified_id_url' => $user->valid_id_path
                ? PrivateDocument::url('user', $user->id, 'valid_id_path')
                : PrivateDocument::urlIf($user->valid_id, 'user', $user->id, 'valid_id'),
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

        // The application reuses the verified ID (the id.verified middleware normally guarantees one)
        if (! $user->verifiedIdPath()) {
            return redirect('/customer/id-verification')->with('error', 'Please verify your ID first.');
        }

        // Load existing rejected application for resubmission fallback
        $existingApp = VerificationRequest::where('user_id', $user->id)
            ->where('type', 'seller_application')
            ->where('status', 'rejected')
            ->latest()
            ->first();

        $isResubmission = $existingApp !== null;
        $fileRule       = fn () => File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024);
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
            'fsic_permit'       => $docRule(),
            'doe_lpg_license'   => $docRule(),
            // DTI / SEC replaces the old LTO upload — required unless the earlier application already has one
            'dti_sec_registration' => $existingApp?->dti_sec_registration_path ? ['nullable', $fileRule()] : ['required', $fileRule()],
            'dti_sec_kind'      => ['required', 'in:dti,sec'],
            'logo'              => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            // Store pin (required — delivery fees and staff clock-in use it)
            'latitude'          => ['required', 'numeric', 'between:-90,90', new InServiceArea('longitude')],
            'longitude'             => ['required', 'numeric', 'between:-180,180'],
            ...StoreDocuments::expiryRules(),
            // Optional extra documents (DTI, barangay clearance, store photo…) — reviewed in Store Documents
            ...StoreDocuments::otherDocumentRules(),
            'terms_agreed'      => ['required', 'accepted'],
        ], StoreDocuments::expiryMessages() + StoreDocuments::otherDocumentMessages() + \App\Support\UploadMessages::for(['bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'dti_sec_registration']) + StoreDocuments::dtiSecMessages() + \App\Support\UploadMessages::for(['logo'], false) + ['latitude.required' => "Please pin your store's location on the map.", 'longitude.required' => "Please pin your store's location on the map."]);

        // The user's existing store (resubmission) — never compared with itself
        $ownStore  = Store::where('user_id', $user->id)->first();
        $otherRows = StoreDocuments::filledOtherRows($request);
        StoreDocuments::assertOtherRowsAllowed($otherRows, $ownStore?->id);

        // Duplicate store? A true duplicate is refused; anything else is a warning (seller + admin).
        // Hashes: new uploads, plus the kept files' hashes from the earlier application.
        $newHashes = DuplicateStoreService::hashUploads($request);
        $hashes    = array_merge((array) ($ownStore?->document_hashes ?? []), $newHashes);
        $duplicate = DuplicateStoreService::check([
            'store_name' => $request->store_name,
            'address'    => $request->store_address,
            'barangay'   => $request->store_barangay,
            'city'       => $request->store_city,
            'latitude'   => $request->latitude,
            'longitude'  => $request->longitude,
            'phones'     => array_filter([$request->store_phone, $user->phone]),
            'hashes'     => $hashes,
        ], $ownStore?->id);
        if ($duplicate['block']) {
            throw \Illuminate\Validation\ValidationException::withMessages([$duplicate['block']['field'] => $duplicate['block']['message']]);
        }

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
        $dtiSecPath         = $request->hasFile('dti_sec_registration')
            ? $request->file('dti_sec_registration')->store('dti_sec_registrations', 'local')
            : $existingApp?->dti_sec_registration_path;

        // Always the customer's verified ID (checked at the top of this method)
        $validIdPath = $user->verifiedIdPath();

        // Logo is public; on resubmission the old one is kept unless a new one is uploaded
        $logoPath = $request->hasFile('logo')
            ? $request->file('logo')->store('store-logos', 'public')
            : Store::where('user_id', $user->id)->value('logo');

        // Re-uploaded documents: their earlier auto-read result no longer applies
        $ocr = (array) ($ownStore?->document_ocr ?? []);
        foreach (array_keys($newHashes) as $type) {
            unset($ocr[$type]);
        }
        if ($existingApp?->valid_id_path !== $validIdPath) {
            unset($ocr['valid_id']);   // a different ID file than last time
        }

        $store = DB::transaction(function () use ($request, $user, $existingApp, $birPermitPath, $businessPermitPath, $fsicPermitPath,
            $doeLicensePath, $dtiSecPath, $validIdPath, $logoPath, $hashes, $duplicate, $ocr, $otherRows) {
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
                    'dti_sec_registration' => $dtiSecPath,
                    'dti_sec_kind'    => $request->dti_sec_kind,
                    'logo'            => $logoPath,
                    'latitude'        => $request->latitude,
                    'longitude'       => $request->longitude,
                    'business_permit_expires_at' => $request->business_permit_expires_at,
                    'fsic_permit_expires_at'     => $request->fsic_permit_expires_at,
                    'doe_lpg_license_expires_at' => $request->doe_lpg_license_expires_at,
                    'status'          => 'pending',
                    'document_hashes' => $hashes ?: null,
                    'duplicate_flags' => DuplicateStoreService::flags($duplicate),
                    'document_ocr'    => $ocr ?: null,
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
                'dti_sec_registration_path' => $dtiSecPath,
                'status'               => 'pending',
                'terms_agreed_at'      => now(),
            ]);

            // Proof of agreement to the current Seller Terms + Privacy Policy
            LegalService::accept($user, LegalService::currentIds(['seller_terms', 'privacy_policy']), 'seller_application', $request);

            StoreDocuments::saveOtherDocuments($request, $store, $otherRows, $user->id);

            return $store;
        });

        \App\Services\NotificationService::sendToRole('admin', 'system', 'New seller application',
            "{$user->name} submitted a seller application for \"{$store->store_name}\"."
                . ($duplicate['matches'] ? ' Possible duplicate — check the store page.' : ''),
            ['link' => "/admin/stores/{$store->id}", 'store_id' => $store->id]);

        $redirect = redirect('/customer/become-seller')
            ->with('success', 'Your seller application has been submitted. We will review it within 1–3 business days.');

        return ($warning = DuplicateStoreService::sellerWarning($duplicate)) ? $redirect->with('warning', $warning) : $redirect;
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
