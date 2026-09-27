<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Seller\RefundController as SellerRefundController;
use App\Models\Customer;
use App\Models\Order;
use App\Models\RefundRequest;
use App\Models\StoreCoupon;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class RefundController extends Controller
{
    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    public function index(Request $request): Response
    {
        $customer = $this->getCustomer($request);

        $refunds = $customer
            ? RefundRequest::with(['order', 'store', 'coupon', 'replacementOrder', 'replacementDelivery.rider'])
                ->where('customer_id', $customer->id)
                ->latest()
                ->paginate(20)
                ->through(fn (RefundRequest $r) => SellerRefundController::format($r))
            : collect([]);

        $coupons = $customer
            ? StoreCoupon::usable()->with('store')
                ->where('customer_id', $customer->id)
                ->orderBy('expires_at')
                ->get()
                ->map(fn (StoreCoupon $c) => [
                    'id'         => $c->id,
                    'code'       => $c->code,
                    'amount'     => (float) $c->amount,
                    'store_name' => $c->store?->store_name,
                    'expires_at' => $c->expires_at?->format('M d, Y'),
                ])->values()->all()
            : [];

        return Inertia::render('customer/refunds', [
            'refunds' => $refunds,
            'coupons' => $coupons,
        ]);
    }

    public function store(Request $request, Order $order): RedirectResponse
    {
        $customer = $this->getCustomer($request);

        // Verify this order belongs to this customer
        if (! $customer || $order->customer_id !== $customer->id) {
            abort(403);
        }

        // Only allow refund on delivered orders
        if ($order->status !== 'delivered') {
            return back()->with('error', 'Refunds can only be requested for delivered orders.');
        }

        // One active refund request per order
        $existing = RefundRequest::where('order_id', $order->id)
            ->whereIn('status', ['pending', 'approved', 'processed'])
            ->first();
        if ($existing) {
            return back()->with('error', 'A refund request already exists for this order.');
        }

        $data = $request->validate([
            'amount'               => 'required|numeric|min:1|max:' . max(1, $order->grandTotal()),
            'reason'               => ['required', Rule::in(RefundRequest::REASONS)],
            'preferred_resolution' => ['required', Rule::in(RefundRequest::RESOLUTIONS)],
            'description'          => 'required|string|max:2000',
            'evidence'             => 'nullable|array|max:5',
            'evidence.*'           => 'file|mimes:jpg,jpeg,png,webp|max:10240',
        ]);

        $evidencePaths = [];
        if ($request->hasFile('evidence')) {
            foreach ($request->file('evidence') as $file) {
                $evidencePaths[] = $file->store('refunds/evidence', 'public');
            }
        }

        $refund = RefundRequest::create([
            'order_id'             => $order->id,
            'customer_id'          => $customer->id,
            'store_id'             => $order->store_id,
            'amount'               => $data['amount'],
            'reason'               => $data['reason'],
            'preferred_resolution' => $data['preferred_resolution'],
            'description'          => $data['description'],
            'evidence_paths'       => $evidencePaths ?: null,
            'status'               => 'pending',
        ]);

        // The seller handles the request directly
        if ($order->store_id) {
            NotificationService::sendToStore(
                $order->store_id,
                'refund_request',
                'Refund Requested',
                "A customer requested a refund (₱" . number_format($data['amount'], 2) . ") for order #{$order->order_number}. Please review it.",
                ['order_id' => $order->id, 'refund_id' => $refund->id, 'link' => '/seller/refunds']
            );
        }

        return back()->with('success', 'Refund request submitted. The seller will review it shortly.');
    }

    public function escalate(Request $request, RefundRequest $refund): RedirectResponse
    {
        $customer = $this->getCustomer($request);
        if (! $customer || $refund->customer_id !== $customer->id) {
            abort(403);
        }

        if (! $refund->canEscalate()) {
            return back()->with('error', 'This refund request cannot be escalated.');
        }

        $data = $request->validate([
            'escalation_reason' => 'required|string|max:2000',
        ]);

        $refund->update([
            'escalated_to_admin' => true,
            'escalation_reason'  => $data['escalation_reason'],
            'escalated_at'       => now(),
        ]);

        $orderNo = $refund->order?->order_number;

        NotificationService::sendToRole(
            'platform_admin',
            'refund_request',
            'Refund Dispute Escalated',
            "A customer escalated the refund request for order #{$orderNo} ({$refund->store?->store_name}).",
            ['refund_id' => $refund->id, 'link' => '/admin/refunds']
        );

        NotificationService::sendToStore(
            $refund->store_id,
            'refund_request',
            'Refund Escalated to Admin',
            "The customer escalated the refund request for order #{$orderNo} to the platform admin.",
            ['refund_id' => $refund->id, 'link' => '/seller/refunds']
        );

        return back()->with('success', 'Your dispute has been escalated to the platform admin.');
    }
}
