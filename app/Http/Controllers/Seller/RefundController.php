<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\RefundRequest;
use App\Models\User;
use App\Services\RefundService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sellers handle refund requests for their own orders. Admin only steps in
 * when a customer escalates.
 */
class RefundController extends Controller
{
    public function index(Request $request): Response
    {
        $store  = $request->attributes->get('seller_store');
        $tab    = $request->get('tab', 'pending');
        $search = $request->get('search', '');

        $base = RefundRequest::where('store_id', $store->id);

        $query = (clone $base)->with(['order', 'customer', 'coupon', 'replacementOrder', 'replacementDelivery.rider'])
            ->when($search, fn ($q) => $q->whereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%")))
            ->latest();

        match ($tab) {
            'pending'   => $query->where('status', 'pending'),
            'approved'  => $query->where('status', 'approved'),
            'processed' => $query->where('status', 'processed'),
            'rejected'  => $query->where('status', 'rejected'),
            'escalated' => $query->where('escalated_to_admin', true),
            default     => null,
        };

        $counts = [
            'pending'   => (clone $base)->where('status', 'pending')->count(),
            'approved'  => (clone $base)->where('status', 'approved')->count(),
            'processed' => (clone $base)->where('status', 'processed')->count(),
            'rejected'  => (clone $base)->where('status', 'rejected')->count(),
            'escalated' => (clone $base)->where('escalated_to_admin', true)->count(),
            'all'       => (clone $base)->count(),
        ];

        $riders = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name])
            ->values()
            ->all();

        return Inertia::render('seller/refunds', [
            'items'  => $query->paginate(20)->withQueryString()->through(fn (RefundRequest $r) => static::format($r)),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
            'riders' => $riders,
        ]);
    }

    public function accept(Request $request, RefundRequest $refund): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        if ($refund->store_id !== $store->id) abort(403);

        if ($refund->status !== 'pending') {
            return back()->with('error', 'This refund request has already been handled.');
        }

        $data = $request->validate([
            'resolution'          => ['required', Rule::in(RefundRequest::RESOLUTIONS)],
            'seller_notes'        => 'nullable|string|max:1000',
            'return_method'       => ['nullable', Rule::in(RefundRequest::RETURN_METHODS)],
            'rider_id'            => [
                'required_if:resolution,replacement', 'nullable', 'integer',
                Rule::exists('users', 'id')->where('store_id', $store->id)->where('sub_role', 'rider'),
            ],
            'refund_reference'    => 'required_if:resolution,money_refund|nullable|string|max:100',
            'discount_amount'     => 'required_if:resolution,store_discount|nullable|numeric|min:1|max:' . max(1, (float) $refund->amount),
            'discount_valid_days' => 'nullable|integer|min:1|max:365',
        ]);

        try {
            RefundService::accept($refund, $data['resolution'], $data, $request->user()->id);
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        $label = RefundService::RESOLUTION_LABELS[$data['resolution']];
        return back()->with('success', "Refund request accepted — {$label}.");
    }

    public function reject(Request $request, RefundRequest $refund): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        if ($refund->store_id !== $store->id) abort(403);

        if ($refund->status !== 'pending') {
            return back()->with('error', 'This refund request has already been handled.');
        }

        // Admin ruled for the customer — the seller must now resolve it
        if ($refund->admin_decision === 'favor_customer') {
            return back()->with('error', 'The platform admin ruled in favor of the customer. Please accept and resolve this request.');
        }

        $data = $request->validate([
            'seller_notes' => 'required|string|max:1000',
        ]);

        RefundService::reject($refund, $data['seller_notes']);

        return back()->with('success', 'Refund request rejected.');
    }

    public static function format(RefundRequest $r): array
    {
        return [
            'id'                   => $r->id,
            'order_id'             => $r->order_id,
            'order_number'         => $r->order?->order_number,
            'order_total'          => $r->order ? $r->order->grandTotal() : 0,
            'store_name'           => $r->store?->store_name,
            'customer_name'        => $r->customer?->name,
            'customer_phone'       => $r->customer?->phone,
            'amount'               => (float) $r->amount,
            'reason'               => $r->reason,
            'preferred_resolution' => $r->preferred_resolution,
            'description'          => $r->description,
            'evidence_urls'        => collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
            'status'               => $r->status,
            'seller_resolution'    => $r->seller_resolution,
            'seller_notes'         => $r->seller_notes,
            'refund_reference'     => $r->refund_reference,
            'return_method'        => $r->return_method,
            'coupon'               => $r->coupon ? [
                'code'       => $r->coupon->code,
                'amount'     => (float) $r->coupon->amount,
                'status'     => $r->coupon->status,
                'expires_at' => $r->coupon->expires_at?->format('M d, Y'),
            ] : null,
            'replacement'          => $r->replacement_order_id ? [
                'order_id'        => $r->replacement_order_id,
                'order_number'    => $r->replacementOrder?->order_number,
                'delivery_status' => $r->replacementDelivery?->status,
                'rider_name'      => $r->replacementDelivery?->rider?->name,
            ] : null,
            'escalated_to_admin'   => (bool) $r->escalated_to_admin,
            'escalation_reason'    => $r->escalation_reason,
            'escalated_at'         => $r->escalated_at?->format('M d, Y g:i A'),
            'admin_decision'       => $r->admin_decision,
            'admin_notes'          => $r->admin_notes,
            'admin_decided_at'     => $r->admin_decided_at?->format('M d, Y g:i A'),
            'can_escalate'         => $r->canEscalate(),
            'seller_responded_at'  => $r->seller_responded_at?->format('M d, Y g:i A'),
            'processed_at'         => $r->processed_at?->format('M d, Y g:i A'),
            'created_at'           => $r->created_at->format('M d, Y g:i A'),
        ];
    }
}
