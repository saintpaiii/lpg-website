<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\RefundRequest;
use App\Services\NotificationService;
use App\Services\RefundService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class RefundController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'pending');
        $search = $request->get('search', '');

        $query = RefundRequest::with(['order', 'customer.user', 'store'])
            ->when($search, fn ($q) => $q->whereHas('order', fn ($o) =>
                $o->where('order_number', 'like', "%{$search}%")
            ))
            ->latest();

        $items = match ($tab) {
            'pending'   => (clone $query)->where('status', 'pending')->paginate(20),
            'approved'  => (clone $query)->whereIn('status', ['approved', 'processed'])->paginate(20),
            'rejected'  => (clone $query)->where('status', 'rejected')->paginate(20),
            default     => (clone $query)->paginate(20),
        };

        $counts = [
            'pending'  => RefundRequest::where('status', 'pending')->count(),
            'approved' => RefundRequest::whereIn('status', ['approved', 'processed'])->count(),
            'rejected' => RefundRequest::where('status', 'rejected')->count(),
            'all'      => RefundRequest::count(),
        ];

        $transform = fn (RefundRequest $r) => [
            'id'             => $r->id,
            'order_number'   => $r->order?->order_number,
            'order_total'    => (float) ($r->order?->total_amount ?? 0),
            'store_name'     => $r->store?->store_name,
            'customer_name'  => $r->customer?->name,
            'customer_email' => $r->customer?->user?->email,
            'amount'         => (float) $r->amount,
            'reason'         => $r->reason,
            'description'    => $r->description,
            'status'         => $r->status,
            'admin_notes'    => $r->admin_notes,
            'processed_at'   => $r->processed_at?->format('M d, Y g:i A'),
            'created_at'     => $r->created_at->format('M d, Y g:i A'),
            'evidence_urls'  => collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
        ];

        return Inertia::render('admin/refunds', [
            'items'  => $items->through($transform),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function approve(Request $request, RefundRequest $refund): RedirectResponse
    {
        if (! in_array($refund->status, ['pending'])) {
            return back()->with('error', 'This refund has already been processed.');
        }

        $data = $request->validate([
            'admin_notes' => 'nullable|string|max:1000',
        ]);

        $refund->update([
            'status'      => 'approved',
            'admin_notes' => $data['admin_notes'] ?? null,
        ]);

        // Process: credit customer, deduct seller, mark processed
        RefundService::processApproved($refund->fresh(['order', 'customer.user', 'store']));

        return back()->with('success', 'Refund approved and credits issued to customer.');
    }

    public function reject(Request $request, RefundRequest $refund): RedirectResponse
    {
        if (! in_array($refund->status, ['pending'])) {
            return back()->with('error', 'This refund has already been processed.');
        }

        $data = $request->validate([
            'admin_notes' => 'required|string|max:1000',
        ]);

        $refund->update([
            'status'      => 'rejected',
            'admin_notes' => $data['admin_notes'],
        ]);

        // Notify customer
        $customerUser = $refund->customer?->user;
        if ($customerUser) {
            NotificationService::send(
                $customerUser->id,
                'refund_rejected',
                'Refund Request Rejected',
                "Your refund request for order #{$refund->order?->order_number} was not approved. Reason: {$data['admin_notes']}",
                ['refund_id' => $refund->id]
            );
        }

        return back()->with('success', 'Refund request rejected.');
    }
}
