<?php

namespace App\Http\Controllers\Admin;

use App\Support\PrivateDocument;
use App\Http\Controllers\Controller;
use App\Models\StaffDocument;
use App\Models\Store;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Services\FaceMatchService;
use App\Services\NotificationService;
use App\Services\StaffDocumentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class VerificationController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = in_array($request->get('tab'), ['approved', 'rejected'], true) ? $request->get('tab') : 'pending';
        $search = (string) $request->get('search', '');
        // Type chip: '' = all, a verification type, or 'rider_license' (drivers_license staff documents)
        $type   = in_array($request->get('type'), [...self::TYPES, 'rider_license'], true) ? $request->get('type') : '';
        // Approved tab: only the ones approved automatically by the face match
        $auto   = $tab === 'approved' && $request->boolean('auto');

        // One list across both tables: (src, id, created_at) rows, newest first, then the records are loaded
        $parts = fn (string $status, bool $onlyAuto) => array_values(array_filter([
            $type !== 'rider_license' ? $this->verificationIds($search, $type)->where('v.status', $status)
                ->when($onlyAuto, fn ($q) => $q->where('v.auto_approved', true)) : null,
            in_array($type, ['', 'rider_license'], true) ? $this->licenseIds($search)->where('d.status', $status)
                ->when($onlyAuto, fn ($q) => $q->where('d.auto_approved', true)) : null,
        ]));
        $union = function (array $queries) {
            $q = array_shift($queries);
            foreach ($queries as $more) {
                $q->unionAll($more);
            }

            return $q;
        };
        $count = fn (string $status, bool $onlyAuto = false) => collect($parts($status, $onlyAuto))->sum(fn ($q) => $q->count());

        $counts = [
            'pending'  => $count('pending'),
            'approved' => $count('approved'),
            'rejected' => $count('rejected'),
            'auto'     => $count('approved', true),
        ];

        $paginated = $union($parts($tab, $auto))->orderByDesc('created_at')->orderByDesc('id')->paginate(25)->withQueryString();

        $vrRows  = VerificationRequest::with(['user', 'reviewer'])
            ->whereIn('id', collect($paginated->items())->where('src', 'vr')->pluck('id'))->get()->keyBy('id');
        $licRows = StaffDocument::with(['user' => fn ($q) => $q->withTrashed(), 'store' => fn ($q) => $q->withTrashed(), 'reviewer:id,name'])
            ->whereIn('id', collect($paginated->items())->where('src', 'sd')->pluck('id'))->get()->keyBy('id');

        // Preload stores for all paginated results (avoids N+1)
        $userIds = $vrRows->pluck('user_id');
        $stores  = Store::whereIn('user_id', $userIds)->get()->keyBy('user_id');

        // Preload soft-deleted rejected applications to detect resubmissions (avoids N+1)
        $docFields = [
            'valid_id_path'        => 'Valid ID',
            'bir_permit_path'      => 'BIR Certificate',
            'business_permit_path' => 'Business Permit',
            'fsic_permit_path'     => 'FSIC',
            'doe_lpg_license_path' => 'DOE License to Operate (LTO)',
            'dti_sec_registration_path' => 'DTI/SEC Registration',
        ];

        $previousApps = VerificationRequest::withTrashed()
            ->whereIn('user_id', $userIds)
            ->where('type', 'seller_application')
            ->whereNotNull('deleted_at')
            ->where('status', 'rejected')
            ->orderBy('deleted_at')   // ascending so keyBy keeps the latest per user
            ->get()
            ->keyBy('user_id');

        // Applicant details for the modal — preloaded for the whole page (no N+1)
        $customers = \App\Models\Customer::whereIn('user_id', $userIds)->get()->keyBy('user_id');
        $orderCounts = \App\Models\Order::whereIn('customer_id', $customers->pluck('id'))
            ->selectRaw('customer_id, COUNT(*) as n')->groupBy('customer_id')->pluck('n', 'customer_id');
        $history = VerificationRequest::withTrashed()->with('reviewer:id,name')
            ->whereIn('user_id', $userIds)->whereIn('type', ['seller_application', 'customer_id_verification'])
            ->orderByDesc('created_at')->get()->groupBy(fn ($h) => $h->user_id . '|' . $h->type);

        return Inertia::render('admin/verifications', [
            'since'         => \App\Services\SectionVisitService::sinceIso($request),
            'verifications' => $paginated->through(function ($row) use ($vrRows, $licRows, $stores, $previousApps, $docFields, $customers, $orderCounts, $history, $request) {
                if ($row->src === 'sd') {
                    return $this->licenseRow($licRows->get($row->id), $request);
                }
                $v              = $vrRows->get($row->id);
                $store          = $stores->get($v->user_id);
                $prevApp        = $previousApps->get($v->user_id);
                $isResubmission = $prevApp !== null;

                // Which docs were re-uploaded (path differs from previous submission)?
                $reuploadedDocs = [];
                if ($isResubmission) {
                    foreach ($docFields as $field => $label) {
                        if ($v->$field !== $prevApp->$field) {
                            $reuploadedDocs[] = $label;
                        }
                    }
                }

                return [
                    'key'              => "vr-{$v->id}",
                    'source'           => 'verification',
                    'id'               => $v->id,
                    'face'             => FaceMatchService::present($v) + ['has_selfie' => (bool) $v->selfie_path],
                    'auto_approved'    => (bool) $v->auto_approved,
                    'seen'             => \App\Services\SectionVisitService::flagsFor($request, $v),
                    'type'             => $v->type,
                    'status'           => $v->status,
                    'rejection_reason' => $v->rejection_reason,
                    'reviewed_at'      => $v->reviewed_at?->format('M d, Y'),
                    'created_at'       => $v->created_at->format('M d, Y'),
                    'user_id'          => $v->user_id,
                    'user_name'        => $v->user?->name ?? '—',
                    'user_email'       => $v->user?->email ?? '—',
                    'user_id_verified' => $v->user?->id_verified ?? false,
                    'user_phone'       => $v->user?->phone ?: $customers->get($v->user_id)?->phone,
                    'user_first_name'  => $v->user?->first_name,
                    'user_middle_name' => $v->user?->middle_name,
                    'user_last_name'   => $v->user?->last_name,
                    'user_suffix'      => $v->user?->suffix,
                    // first + middle + last + suffix (the page shows this)
                    'user_full_name'   => $v->user ? (\App\Models\User::composeName($v->user->first_name, $v->user->middle_name, $v->user->last_name, $v->user->suffix) ?: $v->user->name) : null,
                    'user_joined'      => $v->user?->created_at?->format('M d, Y'),
                    'email_verified'   => (bool) $v->user?->email_verified_at,
                    'customer_address' => ($c = $customers->get($v->user_id))
                        ? collect([$c->address, $c->barangay, $c->city])->filter()->implode(', ')
                        : null,
                    'customer_type'    => $c?->customer_type,
                    'order_count'      => $c ? (int) ($orderCounts[$c->id] ?? 0) : null,
                    // Earlier requests of the same type (incl. soft-deleted resubmissions), newest first, max 5
                    'past_attempts'    => collect($history->get($v->user_id . '|' . $v->type, []))
                        ->filter(fn ($h) => $h->id !== $v->id && $h->created_at->lt($v->created_at))
                        ->take(5)
                        ->map(fn ($h) => [
                            'date'     => $h->created_at->timezone('Asia/Manila')->format('M d, Y'),
                            'status'   => $h->status,
                            'reason'   => $h->rejection_reason,
                            'reviewer' => $h->reviewer?->name,
                        ])->values(),
                    'reviewer_name'    => $v->reviewer?->name,
                    // Store info
                    'store_id'         => $store?->id,   // seller applications: "Review on store page →" (J3)
                    'store_status'     => $store?->status,
                    'store_name'       => $store?->store_name,
                    'store_phone'      => $store?->phone,
                    'store_address'    => $store?->address,
                    'store_city'       => $store?->city,
                    'store_barangay'   => $store?->barangay,
                    'store_logo_url'   => $store?->logo ? Storage::url($store->logo) : null,
                    'store_latitude'   => $store?->latitude !== null ? (float) $store?->latitude : null,
                    'store_longitude'  => $store?->longitude !== null ? (float) $store?->longitude : null,
                    // "Valid until" dates the seller entered for each expiring permit
                    'permit_expiries'  => $store ? collect(\App\Support\StoreDocuments::expiringTypes())
                        ->map(fn ($t) => \App\Support\StoreDocuments::summary($store, $t))->values() : [],
                    // Resubmission data
                    'is_resubmission'            => $isResubmission,
                    'previous_rejection_reason'  => $isResubmission ? $prevApp?->rejection_reason : null,
                    'reuploaded_docs'            => $reuploadedDocs,
                    // Document URLs — all 6 + selfie
                    'valid_id_url'          => PrivateDocument::urlIf($v->valid_id_path, 'verification', $v->id, 'valid_id_path'),
                    'selfie_url'            => PrivateDocument::urlIf($v->selfie_path, 'verification', $v->id, 'selfie_path'),
                    'bir_permit_url'        => PrivateDocument::urlIf($v->bir_permit_path, 'verification', $v->id, 'bir_permit_path'),
                    'business_permit_url'   => PrivateDocument::urlIf($v->business_permit_path, 'verification', $v->id, 'business_permit_path'),
                    'fsic_permit_url'       => PrivateDocument::urlIf($v->fsic_permit_path, 'verification', $v->id, 'fsic_permit_path'),
                    'doe_lpg_license_url'   => PrivateDocument::urlIf($v->doe_lpg_license_path, 'verification', $v->id, 'doe_lpg_license_path'),
                    'dti_sec_registration_url' => PrivateDocument::urlIf($v->dti_sec_registration_path, 'verification', $v->id, 'dti_sec_registration_path'),
                    'dti_sec_kind'          => $stores[$v->user_id]->dti_sec_kind ?? null,
                    // Older applications: the separate LTO upload (same document as the DOE license — no longer required)
                    'old_lto_permit_url'    => PrivateDocument::urlIf($v->lto_permit_path, 'verification', $v->id, 'lto_permit_path'),
                    // Auto-read of the valid ID (null = not read yet; the page reads it when the admin opens the request)
                    'ocr'                   => DocumentOcrController::present($v->ocr),
                ];
            }),
            'ocr_enabled' => \App\Services\DocumentOcrService::enabled(),
            'face_enabled' => FaceMatchService::enabled(),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
            'type'   => $type,
            'auto'   => $auto,
        ]);
    }

    private const TYPES = ['seller_application', 'customer_id_verification'];

    /** (src, id, created_at) of verification requests matching the search / type chip. */
    private function verificationIds(string $search, string $type): \Illuminate\Database\Query\Builder
    {
        return DB::table('verification_requests as v')
            ->leftJoin('users as u', 'u.id', '=', 'v.user_id')
            ->whereNull('v.deleted_at')
            ->whereIn('v.type', $type !== '' ? [$type] : self::TYPES)
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('u.name', 'like', "%{$search}%")->orWhere('u.email', 'like', "%{$search}%")))
            ->selectRaw("'vr' as src, v.id as id, v.created_at as created_at");
    }

    /** (src, id, created_at) of riders' driver's licenses (pending ones are the admin's queue since J2). */
    private function licenseIds(string $search): \Illuminate\Database\Query\Builder
    {
        return DB::table('staff_documents as d')
            ->leftJoin('users as u', 'u.id', '=', 'd.user_id')
            ->where('d.doc_type', 'drivers_license')
            // A pending upload replaced by a newer one is history, not a decision
            ->where(fn ($q) => $q->whereNull('d.rejection_reason')->orWhere('d.rejection_reason', '!=', StaffDocument::REPLACED_REASON))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('u.name', 'like', "%{$search}%")->orWhere('u.email', 'like', "%{$search}%")))
            ->selectRaw("'sd' as src, d.id as id, d.created_at as created_at");
    }

    /** A rider's driver's license, in the same row shape as a verification (type 'rider_license'). */
    private function licenseRow(StaffDocument $d, Request $request): array
    {
        $u = $d->user;
        $days = $d->expires_at ? (int) StaffDocumentService::today()->diffInDays($d->expires_at->copy()->startOfDay(), false) : null;

        return [
            'key'              => "sd-{$d->id}",
            'source'           => 'license',
            'id'               => $d->id,
            'seen'             => \App\Services\SectionVisitService::flagsFor($request, $d),
            'type'             => 'rider_license',
            'status'           => $d->status,
            'rejection_reason' => $d->rejection_reason,
            'reviewed_at'      => $d->reviewed_at?->format('M d, Y'),
            'created_at'       => $d->created_at->format('M d, Y'),
            'user_id'          => $d->user_id,
            'user_name'        => $u?->name ?? '—',
            'user_email'       => $u?->email ?? '—',
            'user_id_verified' => false,
            'user_full_name'   => $u ? (User::composeName($u->first_name, $u->middle_name, $u->last_name, $u->suffix) ?: $u->name) : null,
            'user_phone'       => $u?->phone,
            'user_joined'      => $u?->created_at?->format('M d, Y'),
            'reviewer_name'    => $d->reviewer?->name,
            'auto_approved'    => (bool) $d->auto_approved,
            'face'             => FaceMatchService::present($d) + ['has_selfie' => (bool) $d->selfie_path],
            'store_name'       => $d->store?->store_name,
            'license_number'   => $d->document_number,
            'license_expires_on' => $d->expires_at?->format('M j, Y'),
            'license_days_left'  => $days,
            'license_url'      => PrivateDocument::url('staff-document', $d->id, 'file_path'),
            'selfie_url'       => PrivateDocument::urlIf($d->selfie_path, 'staff-document', $d->id, 'selfie_path'),
            // Unused for licenses (same row shape as a verification)
            'valid_id_url' => null, 'store_phone' => null, 'store_address' => null, 'store_city' => null, 'store_barangay' => null,
            'is_resubmission' => false, 'previous_rejection_reason' => null, 'reuploaded_docs' => [],
            'bir_permit_url' => null, 'business_permit_url' => null, 'fsic_permit_url' => null, 'doe_lpg_license_url' => null,
        ];
    }

    /**
     * Mark a customer ID verification approved — the ONE path for the admin's Approve and the automatic face-match
     * approval ($by = null → auto_approved, reviewed_by stays null), so nothing else differs.
     */
    public static function approveCustomer(VerificationRequest $verification, ?User $by, ?array $face = null): void
    {
        $verification->update([
            'status'           => 'approved',
            'reviewed_by'      => $by?->id,
            'reviewed_at'      => now(),
            'rejection_reason' => null,
            'auto_approved'    => $by === null,
        ]);

        $verification->user?->update([
            'id_verification_status' => 'verified',
            'id_verified_at'         => now(),
            'id_rejection_reason'    => null,
            'id_verified'            => true,
        ]);

        if ($verification->user_id) {
            NotificationService::send(
                $verification->user_id,
                'system',
                'Identity Verified!',
                'Your identity has been verified. You can now place orders on the platform.',
                ['link' => '/customer/products']
            );
        }

        // Automatic: the admins still see it (in-app only)
        if ($by === null) {
            $name = $verification->user?->name ?? 'A customer';
            $pct  = FaceMatchService::pct($face['score'] ?? (float) $verification->face_match_score);
            foreach (['platform_admin', 'admin'] as $role) {
                NotificationService::sendToRole($role, 'system', 'Verified automatically',
                    "{$name} was verified automatically (face match {$pct}).", ['link' => '/admin/verifications?tab=approved&auto=1']);
            }
        }
    }

    public function approve(Request $request, VerificationRequest $verification): RedirectResponse
    {
        // Seller applications are approved only on the store page, where the checklist is required
        if ($verification->type === 'seller_application') {
            $storeId = Store::where('user_id', $verification->user_id)->value('id');

            return ($storeId ? redirect("/admin/stores/{$storeId}") : back())
                ->with('error', 'Review seller applications on the store page — accept or reject each document there.');
        }

        if ($verification->status !== 'pending') {
            return back()->with('error', 'This request was already decided.');
        }

        if ($verification->type === 'customer_id_verification') {
            static::approveCustomer($verification, $request->user());

            return back()->with('success', "{$verification->user?->name}'s identity has been verified. They can now place orders.");
        }

        // Fallback
        $verification->update(['status' => 'approved', 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
        $verification->user?->update([
            'id_verified'            => true,
            'id_verification_status' => 'verified',
            'id_verified_at'         => now(),
        ]);
        return back()->with('success', "Verification for {$verification->user?->name} approved.");
    }

    public function reject(Request $request, VerificationRequest $verification): RedirectResponse
    {
        // Seller applications are reviewed only on the store page (Accept / Reject per document, then send back) — J3
        if ($verification->type === 'seller_application') {
            $storeId = Store::where('user_id', $verification->user_id)->value('id');

            return ($storeId ? redirect("/admin/stores/{$storeId}") : back())
                ->with('error', 'Review seller applications on the store page — accept or reject each document there.');
        }

        $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        // Pending requests can be rejected; an APPROVED customer ID (e.g. auto-approved by the face match) can be revoked
        $revoke = $verification->status === 'approved' && $verification->type === 'customer_id_verification';
        if ($verification->status !== 'pending' && ! $revoke) {
            return back()->with('error', 'This request was already decided.');
        }

        $verification->update([
            'status'           => 'rejected',
            'reviewed_by'      => $request->user()->id,
            'reviewed_at'      => now(),
            'rejection_reason' => $request->reason,
        ]);

        // Mark the seller's store as rejected too
        if ($verification->type === 'seller_application') {
            Store::where('user_id', $verification->user_id)->update(['status' => 'rejected']);

            if ($verification->user_id) {
                NotificationService::send(
                    $verification->user_id,
                    'system',
                    'Your seller application was not approved',
                    'Unfortunately your seller application was rejected. Reason: ' . $request->reason,
                    ['link' => '/customer/become-seller']
                );
            }
        }

        if ($verification->type === 'customer_id_verification') {
            $verification->user?->update([
                'id_verification_status' => 'rejected',
                'id_rejection_reason'    => $request->reason,
                // Revoke: they can't order again until a new ID is approved
                'id_verified'            => false,
                'id_verified_at'         => null,
            ]);

            if ($verification->user_id) {
                NotificationService::send(
                    $verification->user_id,
                    'system',
                    $revoke ? 'Identity verification revoked' : 'Identity Verification Rejected',
                    ($revoke ? 'Your ID verification was revoked by an admin. Reason: ' : 'Your ID verification was not approved. Reason: ')
                        . rtrim($request->reason, '. ') . '. Please re-upload your documents.',
                    ['link' => '/customer/id-verification']
                );
            }
        }

        return back()->with('success', $revoke
            ? "Verification for {$verification->user?->name} revoked — they can't order until a new ID is approved."
            : "Verification for {$verification->user?->name} rejected.");
    }
}
