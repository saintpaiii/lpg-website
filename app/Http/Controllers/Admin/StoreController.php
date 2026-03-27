<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountAction;
use App\Models\Store;
use App\Models\VerificationRequest;
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
            'stores' => $stores->paginate(20)->withQueryString()->through(fn ($s) => [
                'id'             => $s->id,
                'store_name'     => $s->store_name,
                'city'           => $s->city,
                'province'       => $s->province,
                'status'         => $s->status,
                'commission_rate'=> (float) $s->commission_rate,
                'created_at'     => $s->created_at->format('M d, Y'),
                'deleted_at'     => $s->deleted_at?->format('M d, Y'),
                'owner_name'     => $s->owner?->name ?? '—',
                'owner_email'    => $s->owner?->email ?? '—',
            ]),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function show(Store $store): Response
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
            'commissions'     => (float) $store->invoices()->sum('platform_commission'),
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

        return Inertia::render('admin/store-show', [
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
                'commission_rate'        => (float) $store->commission_rate,
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
                // Document URLs — check verification request first, fall back to direct fields
                'valid_id_url' => ($verification?->valid_id_path ?? $store->owner?->valid_id)
                    ? Storage::url($verification?->valid_id_path ?? $store->owner->valid_id) : null,
                'bir_permit_url' => ($verification?->bir_permit_path ?? $store->bir_permit)
                    ? Storage::url($verification?->bir_permit_path ?? $store->bir_permit) : null,
                'business_permit_url' => ($verification?->business_permit_path ?? $store->business_permit)
                    ? Storage::url($verification?->business_permit_path ?? $store->business_permit) : null,
                'fsic_permit_url' => ($verification?->fsic_permit_path ?? $store->fsic_permit)
                    ? Storage::url($verification?->fsic_permit_path ?? $store->fsic_permit) : null,
                'doe_lpg_license_url' => ($verification?->doe_lpg_license_path ?? $store->doe_lpg_license)
                    ? Storage::url($verification?->doe_lpg_license_path ?? $store->doe_lpg_license) : null,
                'lto_permit_url' => ($verification?->lto_permit_path ?? $store->lto_permit)
                    ? Storage::url($verification?->lto_permit_path ?? $store->lto_permit) : null,
                'terms_agreed_at' => $verification?->terms_agreed_at?->format('M d, Y'),
            ],
            'stats'   => $stats,
            'history' => $history,
        ]);
    }

    public function approve(Request $request, Store $store): RedirectResponse
    {
        $store->update([
            'status'      => 'approved',
            'approved_at' => now(),
            'approved_by' => $request->user()->id,
        ]);

        // Mark owner's ID as verified
        $store->owner?->update(['id_verified' => true]);

        // Approve associated seller verification request
        $store->owner?->verificationRequests()
            ->where('type', 'seller_application')
            ->where('status', 'pending')
            ->update([
                'status'      => 'approved',
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

        return back()->with('success', "{$store->store_name} has been approved.");
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

    public function updateCommissionRate(Request $request, Store $store): RedirectResponse
    {
        $request->validate([
            'commission_rate' => 'required|numeric|min:0|max:100',
        ]);

        $store->update(['commission_rate' => $request->commission_rate]);

        return back()->with('success', "Commission rate for {$store->store_name} updated to {$request->commission_rate}%.");
    }

    public function forceDestroy(Store $store): RedirectResponse
    {
        $store->forceDelete();

        return redirect()->route('admin.stores')->with('success', 'Store permanently deleted.');
    }
}
