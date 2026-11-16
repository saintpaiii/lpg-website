<?php

namespace App\Http\Controllers;

use App\Models\StaffDocument;
use App\Models\Store;
use App\Services\FaceMatchService;
use App\Services\NotificationService;
use App\Services\StaffDocumentService;
use App\Support\PrivateDocument;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * My Documents for store staff and riders (/rider/documents, /seller/my-documents).
 * Riders must upload a driver's license WITH a live selfie: when the faces match it is approved automatically,
 * otherwise the platform admin reviews it (the store owner only monitors licenses). The owner reviews the other documents.
 */
class StaffDocumentController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $this->staff($request);
        $docs = StaffDocument::where('user_id', $user->id)->latest()->get();
        $licenses = $docs->where('doc_type', 'drivers_license');

        return Inertia::render('staff/my-documents', [
            'is_rider'      => $user->isRider(),
            'has_store'     => (bool) $user->store_id,
            'post_url'      => $user->isRider() ? '/rider/documents' : '/seller/my-documents',
            'license'       => $user->isRider() ? [
                'status'  => StaffDocumentService::riderLicenseStatus($user, $licenses),
                'message' => StaffDocumentService::message($user, $licenses),
                'current' => ($l = StaffDocumentService::licenseInfo($user, $licenses)['license']) ? $this->present($l) : null,
            ] : null,
            'documents'     => $docs->map(fn ($d) => $this->present($d))->values(),
            'types'         => collect(StaffDocumentService::TYPES)->except('drivers_license')->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $this->staff($request);
        if (! $user->store_id) {
            return back()->with('error', 'Your account is not linked to a store. Ask your store owner.');
        }

        $isLicense = $request->input('doc_type') === 'drivers_license';
        $data = $request->validate([
            'doc_type'        => ['required', Rule::in(array_keys(StaffDocumentService::TYPES))],
            'label'           => ['required_if:doc_type,other', 'nullable', 'string', 'max:100'],
            'document_number' => [$isLicense ? 'required' : 'nullable', 'string', 'max:50'],
            'file'            => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'expires_at'      => [$isLicense ? 'required' : 'nullable', 'date', 'after:today'],
            // Driver's license: a live camera selfie, compared with the license photo
            'selfie'          => [$isLicense ? 'required' : 'nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ], [
            'selfie.required'          => 'Take a selfie with your camera — it is compared with the photo on your license.',
            'label.required_if'        => 'Please enter the name of the document.',
            'document_number.required' => 'Please enter your license number.',
            'expires_at.required'      => 'Please enter the date your license is valid until.',
            'expires_at.after'         => 'The document must still be valid (date after today).',
            'file.max'                 => 'The file must be 5 MB or smaller.',
        ] + \App\Support\UploadMessages::for(['file']));

        $type  = $data['doc_type'];
        $label = $type === 'other' ? trim((string) $data['label']) : null;
        $same  = fn () => StaffDocument::where('user_id', $user->id)->where('doc_type', $type)
            ->when($type === 'other', fn ($q) => $q->where('label', $label));

        // A license waiting for the admin can be replaced any time (new selfie / clearer photo); other documents wait for the owner
        if (! $isLicense && $same()->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['file' => 'This document is already waiting for review.']);
        }
        // Rejections by a person only (a replaced upload has reviewed_by null)
        if ($same()->where('status', 'rejected')->whereNotNull('reviewed_by')->where('reviewed_at', '>=', now()->subDays(30))->count() >= StaffDocumentService::MAX_REJECTIONS) {
            throw ValidationException::withMessages(['file' => "You've reached 5 attempts. Please talk to your store owner."]);
        }

        if ($isLicense) {
            return $this->storeLicense($request, $user, $data);
        }

        StaffDocument::create([
            'user_id'         => $user->id,
            'store_id'        => $user->store_id,
            'doc_type'        => $type,
            'label'           => $label,
            'document_number' => $data['document_number'] ?? null,
            'file_path'       => $request->file('file')->store('staff_documents', 'local'),
            'expires_at'      => $data['expires_at'] ?? null,
            'status'          => 'pending',
        ]);

        $name = StaffDocumentService::label($type, $label);
        if ($ownerId = Store::whereKey($user->store_id)->value('user_id')) {
            NotificationService::send($ownerId, 'system', 'Staff document to review', "{$user->name} uploaded {$name} for your review.",
                ['link' => "/seller/staff/{$user->id}"]);
        }

        return back()->with('success', "{$name} uploaded. Your store owner will review it.");
    }

    /** Max face checks per rider per hour (each one is an API call). */
    private const LICENSE_TRIES_PER_HOUR = 5;

    /** Driver's license + live selfie → face match → approved automatically, or waiting for the platform admin. */
    private function storeLicense(Request $request, $user, array $data): RedirectResponse
    {
        $key = "face-check:license:{$user->id}";
        if (RateLimiter::tooManyAttempts($key, self::LICENSE_TRIES_PER_HOUR)) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($key) / 60));
            throw ValidationException::withMessages(['selfie' => "Too many tries. Please wait {$minutes} minute(s) and try again."]);
        }
        RateLimiter::hit($key, 3600);

        $filePath   = $request->file('file')->store('staff_documents', 'local');
        $selfiePath = $request->file('selfie')->store('staff_documents/selfies', 'local');
        $face = FaceMatchService::compare(Storage::disk('local')->path($filePath), Storage::disk('local')->path($selfiePath), 'license');

        $doc = DB::transaction(function () use ($user, $data, $filePath, $selfiePath, $face) {
            // The upload waiting for the admin is replaced (kept for history, files kept)
            StaffDocument::where('user_id', $user->id)->where('doc_type', 'drivers_license')->where('status', 'pending')
                ->update(['status' => 'rejected', 'rejection_reason' => StaffDocument::REPLACED_REASON, 'reviewed_by' => null, 'reviewed_at' => null]);

            return StaffDocument::create([
                'user_id'         => $user->id,
                'store_id'        => $user->store_id,
                'doc_type'        => 'drivers_license',
                'document_number' => $data['document_number'],
                'file_path'       => $filePath,
                'selfie_path'     => $selfiePath,
                'expires_at'      => $data['expires_at'],
                'status'          => 'pending',
            ] + FaceMatchService::columns($face));
        });

        if ($face['status'] === 'passed') {
            StaffDocumentService::approveLicense($doc->load(['user', 'store']), null);

            return back()->with('success', "Driver's license approved automatically — your selfie matched (" . FaceMatchService::pct($face['score']) . '). You can make deliveries after you clock in.');
        }

        foreach (['platform_admin', 'admin'] as $role) {
            NotificationService::sendToRole($role, 'system', "Rider's license to review",
                "{$user->name}'s driver's license needs a review ({$face['message']}).", ['link' => '/admin/verifications?type=rider_license']);
        }

        return back()->with('warning', "We couldn't confirm your photo automatically (" . FaceMatchService::reasonForUser($face['status'], 'license')
            . '). An admin will review it — usually within 24 hours. You can wait, or retake your selfie / upload a clearer license now.');
    }

    private function present(StaffDocument $d): array
    {
        return [
            'id'              => $d->id,
            'doc_type'        => $d->doc_type,
            'label'           => StaffDocumentService::label($d->doc_type, $d->label),
            'document_number' => $d->document_number,
            'expires_on'      => $d->expires_at?->format('M j, Y'),
            'status'          => $d->status,
            'reason'          => $d->rejection_reason,
            'date'            => $d->created_at->timezone('Asia/Manila')->format('M j, Y'),
            'url'             => PrivateDocument::url('staff-document', $d->id, 'file_path'),
            'selfie_url'      => PrivateDocument::urlIf($d->selfie_path, 'staff-document', $d->id, 'selfie_path'),
            'auto_approved'   => (bool) $d->auto_approved,
            'face_status'     => $d->face_match_status,
            // Pending: why it wasn't approved automatically (plain words)
            'face_reason'     => $d->status === 'pending' ? ($d->selfie_path ? FaceMatchService::reasonForUser($d->face_match_status, 'license') : 'it was uploaded before the selfie check') : null,
            'replaced'        => $d->rejection_reason === StaffDocument::REPLACED_REASON,
        ];
    }

    /** Riders and store staff only (the 'seller' middleware also lets the owner in). */
    private function staff(Request $request)
    {
        $user = $request->user();
        abort_unless($user->role === 'seller_staff' || $user->isRider(), 403);

        return $user;
    }
}
