<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Seller\RefundController as SellerRefundController;
use App\Models\RefundRequest;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Refund disputes — sellers resolve refunds themselves; the admin only
 * reviews requests a customer has escalated.
 */
class RefundController extends Controller
{
    public function index(Request $request): Response
    {
        $tab    = $request->get('tab', 'open');
        $search = $request->get('search', '');

        $base = RefundRequest::where('escalated_to_admin', true);

        $query = (clone $base)->with(['order', 'customer.user', 'store', 'coupon', 'replacementOrder', 'replacementDelivery.rider'])
            ->when($search, fn ($q) => $q->where(fn ($w) => $w
                ->whereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%"))
                ->orWhereHas('store', fn ($s) => $s->where('store_name', 'like', "%{$search}%"))
            ))
            ->orderByDesc('escalated_at');

        match ($tab) {
            'open'    => $query->whereNull('admin_decision'),
            'decided' => $query->whereNotNull('admin_decision'),
            default   => null,
        };

        $counts = [
            'open'    => (clone $base)->whereNull('admin_decision')->count(),
            'decided' => (clone $base)->whereNotNull('admin_decision')->count(),
            'all'     => (clone $base)->count(),
        ];

        return Inertia::render('admin/refunds', [
            'items'  => $query->paginate(20)->withQueryString()->through(fn (RefundRequest $r) => SellerRefundController::format($r) + [
                'customer_email' => $r->customer?->user?->email,
            ]),
            'counts' => $counts,
            'tab'    => $tab,
            'search' => $search,
        ]);
    }

    public function decide(Request $request, RefundRequest $refund): RedirectResponse
    {
        if (! $refund->escalated_to_admin) {
            return back()->with('error', 'Only escalated refund disputes can be decided by the admin.');
        }
        if ($refund->admin_decision) {
            return back()->with('error', 'A decision has already been made on this dispute.');
        }

        $data = $request->validate([
            'decision'    => 'required|in:favor_customer,favor_seller',
            'admin_notes' => 'required|string|max:1000',
        ]);

        $updates = [
            'admin_decision'   => $data['decision'],
            'admin_notes'      => $data['admin_notes'],
            'admin_decided_at' => now(),
        ];

        // Ruling for the customer re-opens the request so the seller must resolve it
        if ($data['decision'] === 'favor_customer') {
            $updates['status'] = 'pending';
        }

        $refund->update($updates);

        $orderNo        = $refund->order?->order_number;
        $customerUserId = $refund->customer?->user_id;

        if ($data['decision'] === 'favor_customer') {
            NotificationService::sendToStore(
                $refund->store_id,
                'refund_request',
                'Refund Dispute: Ruled in Favor of Customer',
                "The platform admin reviewed the refund dispute for order #{$orderNo} and ruled in favor of the customer. Please resolve it. Admin notes: {$data['admin_notes']}",
                ['refund_id' => $refund->id, 'link' => '/seller/refunds']
            );
            if ($customerUserId) {
                NotificationService::send(
                    $customerUserId,
                    'refund_approved',
                    'Refund Dispute Decided in Your Favor',
                    "The platform admin ruled in your favor for order #{$orderNo}. The seller has been instructed to resolve your request.",
                    ['refund_id' => $refund->id, 'link' => '/customer/refunds']
                );
            }
        } else {
            NotificationService::sendToStore(
                $refund->store_id,
                'refund_request',
                'Refund Dispute: Ruled in Your Favor',
                "The platform admin upheld your decision on the refund dispute for order #{$orderNo}.",
                ['refund_id' => $refund->id, 'link' => '/seller/refunds']
            );
            if ($customerUserId) {
                NotificationService::send(
                    $customerUserId,
                    'refund_rejected',
                    'Refund Dispute Decided',
                    "The platform admin reviewed your dispute for order #{$orderNo} and upheld the seller's decision. Notes: {$data['admin_notes']}",
                    ['refund_id' => $refund->id, 'link' => '/customer/refunds']
                );
            }
        }

        return back()->with('success', 'Decision recorded and both parties notified.');
    }
}
