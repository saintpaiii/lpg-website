<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\VerificationRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class VerificationController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'pending');
        $search = $request->get('search', '');

        $query = VerificationRequest::with(['user', 'reviewer'])
            ->where('type', 'seller_application')
            ->when($search, fn ($q) => $q->whereHas('user', fn ($u) =>
                $u->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
            ))
            ->latest();

        $items = match ($tab) {
            'approved' => (clone $query)->where('status', 'approved'),
            'rejected' => (clone $query)->where('status', 'rejected'),
            default    => (clone $query)->where('status', 'pending'),
        };

        $counts = [
            'pending'  => VerificationRequest::where('type', 'seller_application')->where('status', 'pending')->count(),
            'approved' => VerificationRequest::where('type', 'seller_application')->where('status', 'approved')->count(),
            'rejected' => VerificationRequest::where('type', 'seller_application')->where('status', 'rejected')->count(),
        ];

        $paginated = $items->paginate(25)->withQueryString();

        // Preload stores for all paginated results (avoids N+1)
        $userIds = $paginated->pluck('user_id');
        $stores  = Store::whereIn('user_id', $userIds)->get()->keyBy('user_id');

        // Preload soft-deleted rejected applications to detect resubmissions (avoids N+1)
        $docFields = [
            'valid_id_path'        => 'Valid ID',
            'bir_permit_path'      => 'BIR Certificate',
            'business_permit_path' => 'Business Permit',
            'fsic_permit_path'     => 'FSIC',
            'doe_lpg_license_path' => 'DOE LPG License',
            'lto_permit_path'      => 'LTO Permit',
        ];

        $previousApps = VerificationRequest::withTrashed()
            ->whereIn('user_id', $userIds)
            ->where('type', 'seller_application')
            ->whereNotNull('deleted_at')
            ->where('status', 'rejected')
            ->orderBy('deleted_at')   // ascending so keyBy keeps the latest per user
            ->get()
            ->keyBy('user_id');

        return Inertia::render('admin/verifications', [
            'verifications' => $paginated->through(function ($v) use ($stores, $previousApps, $docFields) {
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
                    'id'               => $v->id,
                    'type'             => $v->type,
                    'status'           => $v->status,
                    'rejection_reason' => $v->rejection_reason,
                    'reviewed_at'      => $v->reviewed_at?->format('M d, Y'),
                    'created_at'       => $v->created_at->format('M d, Y'),
                    'user_id'          => $v->user_id,
                    'user_name'        => $v->user?->name ?? '—',
                    'user_email'       => $v->user?->email ?? '—',
                    'user_id_verified' => $v->user?->id_verified ?? false,
                    'reviewer_name'    => $v->reviewer?->name,
                    // Store info
                    'store_name'       => $store?->store_name,
                    'store_phone'      => $store?->phone,
                    'store_address'    => $store?->address,
                    'store_city'       => $store?->city,
                    'store_barangay'   => $store?->barangay,
                    // Resubmission data
                    'is_resubmission'            => $isResubmission,
                    'previous_rejection_reason'  => $isResubmission ? $prevApp?->rejection_reason : null,
                    'reuploaded_docs'            => $reuploadedDocs,
                    // Document URLs — all 6
                    'valid_id_url'          => $v->valid_id_path ? Storage::url($v->valid_id_path) : null,
                    'bir_permit_url'        => $v->bir_permit_path ? Storage::url($v->bir_permit_path) : null,
                    'business_permit_url'   => $v->business_permit_path ? Storage::url($v->business_permit_path) : null,
                    'fsic_permit_url'       => $v->fsic_permit_path ? Storage::url($v->fsic_permit_path) : null,
                    'doe_lpg_license_url'   => $v->doe_lpg_license_path ? Storage::url($v->doe_lpg_license_path) : null,
                    'lto_permit_url'        => $v->lto_permit_path ? Storage::url($v->lto_permit_path) : null,
                ];
            }),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function approve(Request $request, VerificationRequest $verification): RedirectResponse
    {
        $verification->update([
            'status'      => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        if ($verification->type === 'seller_application') {
            // Promote customer to seller and approve their store
            $verification->user?->update(['role' => 'seller', 'id_verified' => true]);

            Store::where('user_id', $verification->user_id)->update([
                'status'      => 'approved',
                'approved_at' => now(),
                'approved_by' => $request->user()->id,
            ]);

            return back()->with('success', "{$verification->user?->name} has been approved as a seller. They can now access the seller portal.");
        }

        // Regular customer ID verification
        $verification->user?->update(['id_verified' => true]);

        return back()->with('success', "Verification for {$verification->user?->name} approved.");
    }

    public function reject(Request $request, VerificationRequest $verification): RedirectResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $verification->update([
            'status'           => 'rejected',
            'reviewed_by'      => $request->user()->id,
            'reviewed_at'      => now(),
            'rejection_reason' => $request->reason,
        ]);

        // Mark the seller's store as rejected too
        if ($verification->type === 'seller_application') {
            Store::where('user_id', $verification->user_id)->update(['status' => 'rejected']);
        }

        return back()->with('success', "Verification for {$verification->user?->name} rejected.");
    }
}
