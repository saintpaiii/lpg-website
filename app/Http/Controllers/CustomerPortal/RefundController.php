<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\RefundRequest;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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
            ? RefundRequest::with(['order', 'store'])
                ->where('customer_id', $customer->id)
                ->latest()
                ->paginate(20)
                ->through(fn (RefundRequest $r) => [
                    'id'           => $r->id,
                    'order_number' => $r->order?->order_number,
                    'store_name'   => $r->store?->store_name,
                    'amount'       => (float) $r->amount,
                    'reason'       => $r->reason,
                    'description'  => $r->description,
                    'status'       => $r->status,
                    'admin_notes'  => $r->admin_notes,
                    'processed_at' => $r->processed_at?->format('M d, Y'),
                    'created_at'   => $r->created_at->format('M d, Y'),
                    'evidence_urls'=> collect($r->evidence_paths ?? [])->map(fn ($p) => Storage::url($p))->values()->all(),
                ])
            : collect([]);

        $user = $request->user();

        return Inertia::render('customer/refunds', [
            'refunds'         => $refunds,
            'credits_balance' => (float) $user->platform_credits,
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

        // Prevent duplicate pending/approved refund for same order
        $existing = RefundRequest::where('order_id', $order->id)
            ->whereIn('status', ['pending', 'approved', 'processed'])
            ->first();
        if ($existing) {
            return back()->with('error', 'A refund request already exists for this order.');
        }

        $data = $request->validate([
            'amount'      => 'required|numeric|min:1|max:' . $order->total_amount,
            'reason'      => 'required|in:damaged_product,leaking_tank,wrong_product,missing_items,quality_issue,other',
            'description' => 'required|string|max:2000',
            'evidence'    => 'nullable|array|max:5',
            'evidence.*'  => 'file|mimes:jpg,jpeg,png,webp|max:10240',
        ]);

        $evidencePaths = [];
        if ($request->hasFile('evidence')) {
            foreach ($request->file('evidence') as $file) {
                $evidencePaths[] = $file->store('refunds/evidence', 'public');
            }
        }

        $refund = RefundRequest::create([
            'order_id'       => $order->id,
            'customer_id'    => $customer->id,
            'store_id'       => $order->store_id,
            'amount'         => $data['amount'],
            'reason'         => $data['reason'],
            'description'    => $data['description'],
            'evidence_paths' => $evidencePaths ?: null,
            'status'         => 'pending',
        ]);

        // Notify seller
        if ($order->store_id) {
            NotificationService::sendToStore(
                $order->store_id,
                'refund_request',
                'Refund Requested',
                "A customer has requested a ₱" . number_format($data['amount'], 2) . " refund for order #{$order->order_number}.",
                ['order_id' => $order->id, 'refund_id' => $refund->id]
            );
        }

        // Notify platform admins
        NotificationService::sendToRole(
            'platform_admin',
            'refund_request',
            'New Refund Request',
            "Customer requested ₱" . number_format($data['amount'], 2) . " refund for order #{$order->order_number}.",
            ['order_id' => $order->id, 'refund_id' => $refund->id]
        );

        return back()->with('success', 'Refund request submitted. We will review it shortly.');
    }
}
