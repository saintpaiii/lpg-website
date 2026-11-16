<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\VerificationRequest;
use App\Rules\InServiceArea;
use App\Services\DuplicateStoreService;
use App\Services\FaceMatchService;
use App\Services\NotificationService;
use App\Services\StoreReviewService;
use App\Support\StoreDocuments;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Inertia\Inertia;
use Inertia\Response;

/**
 * /seller/pending — "Application under review", and for a SELLER-ONLY account whose application was sent back (J3):
 * each rejected document with its reason and a re-upload for just those. Re-uploaded documents go back to
 * "Not reviewed"; the accepted ones keep their decision. ("Start Selling" customers fix theirs on /customer/become-seller.)
 */
class SellerPendingController extends Controller
{
    public function show(Request $request): Response
    {
        $store = $this->ownRejectedStore($request);

        return Inertia::render('auth/seller-pending', [
            'sent_back' => $store ? [
                'store_name' => $store->store_name,
                'message'    => StoreReviewService::application($store)?->rejection_reason,
                'documents'  => StoreReviewService::rejectedForSeller($store),
                'address'    => ['address' => $store->address, 'city' => $store->city, 'barangay' => $store->barangay,
                    'latitude' => $store->latitude !== null ? (float) $store->latitude : null, 'longitude' => $store->longitude !== null ? (float) $store->longitude : null],
            ] : null,
        ]);
    }

    /** POST /seller/pending/resubmit — re-upload the rejected documents (and fix the address / pin if that was rejected). */
    public function resubmit(Request $request): RedirectResponse
    {
        $store = $this->ownRejectedStore($request);
        abort_unless($store, 403);
        $user = $request->user();

        $rejected = collect(StoreReviewService::rejectedForSeller($store))->pluck('key')->all();
        $docKeys  = array_values(array_intersect($rejected, StoreDocuments::REVIEW_DOCS));
        $fixPin   = in_array('address_pin', $rejected, true);
        if (! $docKeys && ! $fixPin) {
            return back()->with('error', 'Nothing to re-upload here. Please contact the platform admin.');
        }

        $fileRule = fn () => File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024);
        $data = $request->validate([
            ...collect($docKeys)->mapWithKeys(fn ($k) => [$k => ['required', $fileRule()]])->all(),
            // A new ID needs a new live selfie (face match again)
            'selfie' => [in_array('valid_id', $docKeys, true) ? 'required' : 'nullable', File::types(['jpg', 'jpeg', 'png', 'webp'])->max(5 * 1024)],
            ...($fixPin ? [
                'store_address'  => ['required', 'string', 'max:500'],
                'store_city'     => ['required', 'string', 'max:100'],
                'store_barangay' => ['required', 'string', 'max:100'],
                'latitude'       => ['required', 'numeric', 'between:-90,90', new InServiceArea('longitude')],
                'longitude'      => ['required', 'numeric', 'between:-180,180'],
            ] : []),
        ], collect($docKeys)->mapWithKeys(fn ($k) => ["{$k}.required" => 'Please upload the new ' . StoreDocuments::reviewLabel($k, $store->dti_sec_kind) . '.'])->all()
            + ['selfie.required' => 'Take a new selfie with your camera (it is compared with the new ID).']);

        $old = StoreReviewService::application($store);
        $folders = ['valid_id' => 'valid_ids', 'bir_permit' => 'bir_permits', 'business_permit' => 'business_permits',
            'fsic_permit' => 'fsic_permits', 'doe_lpg_license' => 'doe_licenses', 'dti_sec_registration' => 'dti_sec_registrations'];
        $paths = collect($docKeys)->mapWithKeys(fn ($k) => [$k => $request->file($k)->store($folders[$k], 'local')])->all();
        $selfie = $request->hasFile('selfie') ? $request->file('selfie')->store('verifications/selfies', 'local') : null;
        $newHashes = DuplicateStoreService::hashUploads($request);

        $application = DB::transaction(function () use ($store, $user, $old, $paths, $selfie, $data, $fixPin, $docKeys, $newHashes) {
            // Store files: the new permits; the owner's new ID / selfie
            $ocr = (array) ($store->document_ocr ?? []);
            foreach ($docKeys as $k) {
                unset($ocr[$k]);
            }
            $updates = collect($paths)->except('valid_id')->all() + [
                'status'          => 'pending',
                'document_ocr'    => $ocr ?: null,
                'document_hashes' => array_merge((array) ($store->document_hashes ?? []), $newHashes) ?: null,
            ];
            if ($fixPin) {
                $updates += ['address' => $data['store_address'], 'city' => $data['store_city'], 'barangay' => $data['store_barangay'],
                    'latitude' => $data['latitude'], 'longitude' => $data['longitude']];
            }
            $store->update($updates);
            if (isset($paths['valid_id'])) {
                $user->update(['valid_id' => $paths['valid_id'], 'selfie_path' => $selfie ?? $user->selfie_path]);
            }

            // Only the re-uploaded documents (and the address, when fixed) are reviewed again
            StoreReviewService::resetReviews($store->fresh(), $docKeys, $fixPin);

            // A fresh application (the sent-back one is kept, soft-deleted, for the history)
            $fields = ['valid_id_path', 'selfie_path', 'bir_permit_path', 'business_permit_path', 'fsic_permit_path', 'doe_lpg_license_path', 'lto_permit_path', 'dti_sec_registration_path'];
            $copy = $old ? collect($fields)->mapWithKeys(fn ($f) => [$f => $old->{$f}])->all() : [];
            foreach ($paths as $k => $p) {
                $copy["{$k}_path"] = $p;
            }
            if ($selfie) {
                $copy['selfie_path'] = $selfie;
            }
            VerificationRequest::where('user_id', $user->id)->where('type', 'seller_application')->where('status', 'rejected')->delete();

            return VerificationRequest::create($copy + [
                'user_id'         => $user->id,
                'type'            => 'seller_application',
                'status'          => 'pending',
                'terms_agreed_at' => now(),
            ] + ($old && ! isset($paths['valid_id']) ? collect($old->only(['face_match_status', 'face_match_score', 'face_match_needed', 'face_match_message', 'face_checked_at']))->all() : []));
        });

        // New ID → face match again (outside the transaction)
        if (isset($paths['valid_id']) && $selfie) {
            $face = FaceMatchService::compare(Storage::disk('local')->path($paths['valid_id']), Storage::disk('local')->path($selfie), 'ID');
            $application->update(FaceMatchService::columns($face));
        }

        $names = collect($docKeys)->map(fn ($k) => StoreDocuments::reviewLabel($k, $store->dti_sec_kind))
            ->when($fixPin, fn ($c) => $c->push('store address / pin'))->implode(', ');
        NotificationService::sendToRole('admin', 'system', 'Seller application resubmitted',
            "{$store->store_name} re-uploaded: {$names}.", ['link' => "/admin/stores/{$store->id}", 'store_id' => $store->id]);

        return redirect()->route('seller.pending')->with('success', 'Sent! The admin will review the new documents — the ones already accepted stay accepted.');
    }

    /** The signed-in SELLER-ONLY owner's store that was sent back (customers resubmit on Start Selling). */
    private function ownRejectedStore(Request $request): ?Store
    {
        $user = $request->user();
        if (! $user || $user->role !== 'seller') {
            return null;
        }

        return Store::where('user_id', $user->id)->where('status', 'rejected')->first();
    }
}
