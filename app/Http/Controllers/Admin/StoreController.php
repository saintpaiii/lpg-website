<?php

namespace App\Http\Controllers\Admin;

use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
use App\Http\Controllers\Controller;
use App\Models\AccountAction;
use App\Models\Store;
use App\Models\VerificationRequest;
use App\Services\DocumentOcrService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class StoreController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'pending');
        $search = $request->get('search', '');

        $query = Store::withTrashed()
            ->with('owner')
            ->withExists('eligibleRiders')   // hidden from customers without a rider who can deliver
            ->when($search, fn ($q) => $q->where('store_name', 'like', "%{$search}%")
                ->orWhere('city', 'like', "%{$search}%"))
            ->latest();

        $stores = match ($tab) {
            'approved'  => (clone $query)->whereNull('deleted_at')->where('status', 'approved'),
            'rejected'  => (clone $query)->whereNull('deleted_at')->where('status', 'rejected'),
            'suspended' => (clone $query)->whereNull('deleted_at')->where('status', 'suspended'),
            'archived'  => (clone $query)->whereNotNull('deleted_at'),
            default     => (clone $query)->whereNull('deleted_at')->where('status', 'pending'),
        };

        $counts = [
            'pending'   => Store::where('status', 'pending')->count(),
            'approved'  => Store::where('status', 'approved')->count(),
            'rejected'  => Store::where('status', 'rejected')->count(),
            'suspended' => Store::where('status', 'suspended')->count(),
            'archived'  => Store::onlyTrashed()->count(),
        ];

        return Inertia::render('admin/stores', [
            'since'  => \App\Services\SectionVisitService::sinceIso($request),
            'stores' => $stores->paginate(20)->withQueryString()->through(fn ($s) => [
                'id'             => $s->id,
                'seen'           => \App\Services\SectionVisitService::flagsFor($request, $s, newOnly: true),
                'store_name'     => $s->store_name,
                'city'           => $s->city,
                'province'       => $s->province,
                'status'         => $s->status,
                'plan'           => $s->subscription_plan !== 'none' ? \App\Services\SubscriptionService::planName($s->subscription_plan) : 'No plan',
                'plan_status'    => SubscriptionController::statusOf($s),
                'has_eligible_rider' => (bool) $s->eligible_riders_exists,
                'created_at'     => $s->created_at->format('M d, Y'),
                'deleted_at'     => $s->deleted_at?->format('M d, Y'),
                'owner_name'     => $s->owner?->name ?? '—',
                'owner_email'    => $s->owner?->email ?? '—',
                // Saved at registration / rename (DuplicateStoreService) — a warning, not a decision
                'possible_duplicate' => ! empty($s->duplicate_flags['matches'] ?? []),
            ]),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function show(Request $request, Store $store): Response
    {
        $store->loadMissing(['owner', 'approvedBy']);

        // Pull documents from the seller_application verification request as fallback
        $verification = $store->owner
            ? VerificationRequest::where('user_id', $store->owner->id)
                ->where('type', 'seller_application')
                ->latest()
                ->first()
            : null;

        $stats = [
            'total_orders'    => $store->orders()->count(),
            'total_revenue'   => (float) $store->orders()->where('payment_status', 'paid')->sum('total_amount'),
            'total_products'  => $store->products()->count(),
            'active_products' => $store->products()->where('is_active', true)->count(),
            'delivered_orders'=> $store->orders()->where('status', 'delivered')->count(),
        ];

        $history = AccountAction::where('target_type', 'store')
            ->where('target_id', $store->id)
            ->with('performer:id,name')
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->map(fn ($a) => [
                'id'           => $a->id,
                'action'       => $a->action,
                'reason'       => $a->reason,
                'notes'        => $a->notes,
                'performed_by' => $a->performer?->name ?? '—',
                'created_at'   => $a->created_at->format('M d, Y g:i A'),
            ]);

        // Plan + the last 5 plan payments
        $subscription = [
            'plan'      => $store->subscription_plan !== 'none' ? \App\Services\SubscriptionService::planName($store->subscription_plan) : 'No plan',
            'status'    => SubscriptionController::statusOf($store),
            'expires'   => $store->subscription_expires_at?->format('M j, Y g:i A'),
            'days_left' => \App\Services\SubscriptionService::daysLeft($store),
            'usage'     => \App\Services\SubscriptionService::usage($store),
            'limits'    => \App\Services\SubscriptionService::limits($store),
            'paused'    => \App\Services\SubscriptionService::pausedCounts($store),
            // Cash recorded by the admin, waiting for the owner to accept
            'awaiting'  => ($a = \App\Services\SubscriptionService::waitingCash($store)) ? [
                'plan'   => \App\Services\SubscriptionService::planName($a->plan_key),
                'amount' => (float) $a->amount,
                'since'  => $a->created_at->format('M j, Y g:i A'),
            ] : null,
            'payments'  => $store->subscriptionPayments()->where('status', 'paid')->latest('paid_at')->limit(5)->get()
                ->map(fn ($p) => [
                    'id'             => $p->id,
                    'receipt_number' => $p->receipt_number,
                    'plan'           => \App\Services\SubscriptionService::planName($p->plan_key),
                    'amount'         => (float) $p->amount,
                    'method'         => \App\Services\SubscriptionService::methodLabel($p->method),
                    'period'         => \App\Services\SubscriptionService::periodLabel($p->period_start, $p->period_end),
                    'paid_at'        => $p->paid_at?->format('M j, Y'),
                ])->values(),
        ];

        return Inertia::render('admin/store-show', [
            'subscription' => $subscription,
            // Visible to customers? (rider / plan / documents reasons)
            'visibility'   => $store->status === 'approved' ? $store->visibility() : null,
            'store' => [
                'id'                     => $store->id,
                'store_name'             => $store->store_name,
                'description'            => $store->description,
                'address'                => $store->address,
                'city'                   => $store->city,
                'barangay'               => $store->barangay,
                'province'               => $store->province,
                'phone'                  => $store->phone,
                'email'                  => $store->email,
                'status'                 => $store->status,
                'approved_at'            => $store->approved_at?->format('M d, Y'),
                'created_at'             => $store->created_at->format('M d, Y'),
                'owner_name'             => $store->owner?->name,
                'owner_email'            => $store->owner?->email,
                'owner_phone'            => $store->owner?->phone,
                'owner_id_verified'      => $store->owner?->id_verified ?? false,
                'approved_by_name'       => $store->approvedBy?->name,
                'suspension_reason'      => $store->suspension_reason,
                'suspension_notes'       => $store->suspension_notes,
                'suspended_at'           => $store->suspended_at?->format('M d, Y g:i A'),
                'logo_url'               => $store->logo ? Storage::url($store->logo) : null,
                'latitude'               => $store->latitude !== null ? (float) $store->latitude : null,
                'longitude'              => $store->longitude !== null ? (float) $store->longitude : null,
                'documents_suspended'    => (bool) $store->documents_suspended,
                // Private document links — the store's own file first (an approved renewal), else the application's
                'valid_id_url' => $verification?->valid_id_path
                    ? PrivateDocument::url('verification', $verification->id, 'valid_id_path')
                    : PrivateDocument::urlIf($store->owner?->valid_id, 'user', (int) $store->user_id, 'valid_id'),
                ...collect(StoreDocuments::TYPES)->mapWithKeys(fn ($t, $type) => ["{$type}_url" => $store->{$type}
                    ? PrivateDocument::url('store', $store->id, $type)
                    : PrivateDocument::urlIf($verification?->{"{$type}_path"}, 'verification', (int) $verification?->id, "{$type}_path")])->all(),
                // Expiry date + status of each permit
                'permits' => collect(array_keys(StoreDocuments::TYPES))->map(fn ($t) => StoreDocuments::summary($store, $t))->values(),
                'terms_agreed_at' => $verification?->terms_agreed_at?->format('M d, Y'),
            ],
            'stats'   => $stats,
            'history' => $history,
            // Latest renewals / extra documents the seller uploaded
            'documentHistory' => $store->documentSubmissions()->with('reviewer:id,name')->latest()->limit(20)->get()
                ->map(fn ($d) => [
                    'id'          => $d->id,
                    'label'       => $d->doc_type === 'other' ? ($d->label ?? 'Other document') : StoreDocuments::label($d->doc_type),
                    'date'        => $d->created_at->timezone('Asia/Manila')->format('M d, Y'),
                    'expires_on'  => $d->expires_at?->format('M d, Y'),
                    'status'      => $d->status,
                    'reviewer'    => $d->reviewer?->name,
                    'reason'      => $d->rejection_reason,
                    'url'         => PrivateDocument::url('store-document', $d->id, 'file_path'),
                    'is_other'    => $d->doc_type === 'other',
                    'ocr_key'     => 'sub-' . $d->id,
                    'ocr'         => DocumentOcrController::present($d->ocr),
                ])->values(),

            // ── Review aids ──────────────────────────────────────────────────
            'checklist'       => collect(config('store_checklist'))->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            'approvalChecks'  => $this->approvalChecks($store),
            'duplicates'      => array_values($store->duplicate_flags['matches'] ?? []),
            'ocrEnabled'      => DocumentOcrService::enabled(),
            // Auto-read results of the required documents + the owner's ID (null = not read yet; key missing = no file)
            'documentOcr'     => $this->requiredOcr($store),
            'canReviewDocuments' => (bool) $request->user()?->canReviewDocuments(),
            'canApprove'      => $request->user()?->isAdmin() || $request->user()?->hasPermission('verifications.view'),
        ]);
    }

    /** Saved checklist for the read-only view; null when nothing was saved. */
    private function approvalChecks(Store $store): ?array
    {
        $c = $store->approval_checks;
        if (! $c) {
            return null;
        }
        $labels = config('store_checklist');

        return [
            'items'   => collect($c['items'] ?? [])->filter()->keys()->map(fn ($k) => $labels[$k] ?? $k)->values(),
            'note'    => $c['note'] ?? null,
            'by_name' => $c['by_name'] ?? null,
            'at'      => isset($c['at']) ? \Illuminate\Support\Carbon::parse($c['at'])->timezone('Asia/Manila')->format('M j, Y g:i A') : null,
        ];
    }

    private function requiredOcr(Store $store): array
    {
        $saved = (array) ($store->document_ocr ?? []);
        $out   = [];
        foreach (['valid_id', ...array_keys(StoreDocuments::TYPES)] as $key) {
            [$path] = DocumentOcrController::requiredDocument($store, $key);
            if ($path) {
                $out[$key] = DocumentOcrController::present($saved[$key] ?? null);
            }
        }

        return $out;
    }

    /**
     * Approve a seller application — only from the store page, with every item of the "Before you approve" checklist
     * ticked (config/store_checklist.php). Same access as Verifications (route middleware permission:verifications.view).
     */
    public function approve(Request $request, Store $store): RedirectResponse
    {
        if ($store->status !== 'pending') {
            return back()->with('error', 'This store is not waiting for approval.');
        }

        $keys = array_keys(config('store_checklist'));
        $data = $request->validate([
            'checks'   => ['required', 'array'],
            ...collect($keys)->mapWithKeys(fn ($k) => ["checks.$k" => ['required', 'accepted']])->all(),
            'note'     => ['nullable', 'string', 'max:500'],
        ], [
            'checks.required' => 'Tick every check before approving.',
            ...collect($keys)->mapWithKeys(fn ($k) => ["checks.$k.required" => 'Tick every check before approving.', "checks.$k.accepted" => 'Tick every check before approving.'])->all(),
        ]);

        $approved = \Illuminate\Support\Facades\DB::transaction(function () use ($store, $request, $keys, $data) {
            // Lock the row: two admins clicking Approve at once approve (and start the trial) only once
            $row = Store::whereKey($store->id)->lockForUpdate()->first();
            if (! $row || $row->status !== 'pending') {
                return false;
            }

            $row->update([
                'status'          => 'approved',
                'approved_at'     => now(),
                'approved_by'     => $request->user()->id,
                'approval_checks' => [
                    'items'   => collect($keys)->mapWithKeys(fn ($k) => [$k => true])->all(),
                    'note'    => ($data['note'] ?? null) ?: null,
                    'by_id'   => $request->user()->id,
                    'by_name' => $request->user()->name,
                    'at'      => now()->toIso8601String(),
                ],
            ]);

            return true;
        });
        if (! $approved) {
            return back()->with('error', 'This store is not waiting for approval.');
        }
        $store->refresh();

        // Mark owner's ID as verified
        $store->owner?->update([
            'id_verified'            => true,
            'id_verification_status' => 'verified',
            'id_verified_at'         => now(),
        ]);

        // Approve associated seller verification request
        $store->owner?->verificationRequests()
            ->where('type', 'seller_application')
            ->where('status', 'pending')
            ->update([
                'status'      => 'approved',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

        // The one-time 30-day Premium trial (never a second time)
        \App\Services\SubscriptionService::startTrial($store->fresh());

        $this->welcomeSeller($store);

        return back()->with('success', "{$store->store_name} has been approved.");
    }

    /** After approval: a customer who applied through "Become a seller" becomes a seller, and the owner is told. */
    private function welcomeSeller(Store $store): void
    {
        $owner = $store->owner;
        if (! $owner) {
            return;
        }
        if ($owner->role === 'customer') {
            $owner->update(['role' => 'seller']);
        }
        if (! $owner->store_id) {
            $owner->update(['store_id' => $store->id]);
        }

        \App\Services\NotificationService::send(
            $owner->id,
            'system',
            'Your store has been approved!',
            'Congratulations! Your seller application has been approved. You can now access the Seller Portal.',
            ['link' => '/seller/dashboard']
        );
    }

    public function reject(Request $request, Store $store): RedirectResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $store->update(['status' => 'rejected']);

        $store->owner?->verificationRequests()
            ->where('type', 'seller_application')
            ->where('status', 'pending')
            ->update([
                'status'           => 'rejected',
                'reviewed_by'      => $request->user()->id,
                'reviewed_at'      => now(),
                'rejection_reason' => $request->reason,
            ]);

        return back()->with('success', "{$store->store_name} has been rejected.");
    }

    public function suspend(Request $request, Store $store): RedirectResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'notes'  => ['nullable', 'string', 'max:1000'],
        ]);

        $store->update([
            'status'           => 'suspended',
            'suspension_reason'=> $request->reason,
            'suspension_notes' => $request->notes,
            'suspended_at'     => now(),
            'suspended_by'     => $request->user()->id,
        ]);

        AccountAction::create([
            'target_type'  => 'store',
            'target_id'    => $store->id,
            'action'       => 'suspend',
            'reason'       => $request->reason,
            'notes'        => $request->notes,
            'performed_by' => $request->user()->id,
        ]);

        return back()->with('success', "{$store->store_name} has been suspended.");
    }

    public function unsuspend(Request $request, Store $store): RedirectResponse
    {
        $store->update([
            'status'           => 'approved',
            'suspension_reason'=> null,
            'suspension_notes' => null,
            'suspended_at'     => null,
            'suspended_by'     => null,
        ]);

        AccountAction::create([
            'target_type'  => 'store',
            'target_id'    => $store->id,
            'action'       => 'unsuspend',
            'reason'       => null,
            'notes'        => $request->input('notes'),
            'performed_by' => $request->user()->id,
        ]);

        return back()->with('success', "{$store->store_name} has been reinstated.");
    }

    public function destroy(Store $store): RedirectResponse
    {
        $store->delete();

        return redirect()->route('admin.stores')->with('success', 'Store archived.');
    }

    public function restore(Store $store): RedirectResponse
    {
        $store->restore();

        return back()->with('success', "{$store->store_name} restored.");
    }


    public function forceDestroy(Store $store): RedirectResponse
    {
        $store->forceDelete();

        return redirect()->route('admin.stores')->with('success', 'Store permanently deleted.');
    }
}
