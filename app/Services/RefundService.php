<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\RefundRequest;
use App\Models\StoreCoupon;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Refunds are settled directly between seller and customer — the platform
 * holds no funds. The seller picks one resolution:
 *  - replacement:    a ₱0 replacement order + delivery is created
 *  - money_refund:   seller refunds outside the platform and records the reference #
 *  - store_discount: a store coupon usable on the customer's next order from that store
 */
class RefundService
{
    public const RESOLUTION_LABELS = [
        'replacement'    => 'Product Replacement',
        'money_refund'   => 'Money Refund',
        'store_discount' => 'Store Discount',
    ];

    // ── Cancelled order with money paid (J5) ──────────────────────────────────

    /**
     * THE one path for "a paid order was cancelled": a money refund request (reason order_cancelled, status pending)
     * for everything the customer paid on it — Full Payment, a half payment, a consignment down payment, or money
     * that arrived after the cancellation. Safe to call more than once: it only ever adds what is not yet covered
     * (a pending request grows; a handled one gets a second request for the rest), so there are never duplicates.
     *
     * $paidBefore: what was paid, measured by the caller BEFORE the order's payment_status changed to to_refund
     * (receipts are used too, so older orders without receipts still get the right amount).
     */
    public static function forCancelledOrder(Order $order, ?float $paidBefore = null): ?RefundRequest
    {
        $created = false;
        $refund = DB::transaction(function () use ($order, $paidBefore, &$created) {
            $order = Order::withTrashed()->whereKey($order->id)->lockForUpdate()->first();
            if (! $order || $order->status !== 'cancelled' || ! $order->customer_id || ! $order->store_id) {
                return null;
            }

            $receipts = (float) \App\Models\PaymentReceipt::where('order_id', $order->id)->sum('amount');
            $paid     = round(max((float) ($paidBefore ?? 0), $receipts), 2);

            $base  = RefundRequest::where('order_id', $order->id)->where('status', '!=', 'rejected');
            $other = (float) (clone $base)->where('reason', '!=', 'order_cancelled')->sum('amount');   // e.g. a J4 handover refund
            $mine  = (clone $base)->where('reason', 'order_cancelled')->orderBy('id')->get();
            $extra = round($paid - $other - (float) $mine->sum('amount'), 2);
            if ($extra <= 0) {
                return $mine->last();
            }

            $describe = fn (float $amount) => "Order {$order->order_number} was cancelled"
                . ($order->cancelled_by ? " by the {$order->cancelled_by}" : '')
                . ($order->cancellation_reason ? " ({$order->cancellation_reason})" : '')
                . '. Refund the ₱' . number_format($amount, 2) . ' the customer paid'
                . ($order->payment_method ? ' (' . str_replace('_', ' ', $order->payment_method) . ')' : '') . '.';

            $pending = $mine->firstWhere('status', 'pending');
            if ($pending) {
                $amount = round((float) $pending->amount + $extra, 2);
                $pending->update(['amount' => $amount, 'description' => $describe($amount)]);

                return $pending;
            }

            $created = true;

            return RefundRequest::create([
                'order_id'             => $order->id,
                'customer_id'          => $order->customer_id,
                'store_id'             => $order->store_id,
                'amount'               => $extra,
                'reason'               => 'order_cancelled',
                'preferred_resolution' => 'money_refund',
                'description'          => $describe($extra),
                'status'               => 'pending',
            ]);
        });

        if ($refund && $created) {
            $refund->loadMissing('order');
            $no = $refund->order?->order_number;
            NotificationService::sendToStore($refund->store_id, 'refund_request', 'Refund to send (order cancelled)',
                "Order {$no} was cancelled after the customer paid. Send ₱" . number_format((float) $refund->amount, 2) . ' back and record the reference in Refunds.',
                ['order_id' => $refund->order_id, 'link' => '/seller/refunds']);
            static::notifyCustomer($refund, 'refund_request', 'Refund on its way',
                "Order {$no} was cancelled. The store will refund the ₱" . number_format((float) $refund->amount, 2) . ' you paid.');
        }

        return $refund;
    }

    /**
     * J6 — the customer paid MORE than the order still owed ("Pay the remaining" paid twice, or paid online after the rider
     * collected the cash): one money refund request (reason overpayment, pending) for the extra, through the same refund
     * flow. Idempotent per PayMongo payment: refund_requests.payment_id is unique — the webhook and the return-verify can
     * both fire, there is never a second request. No receipt is issued for the extra (the caller only receipts what was owed).
     */
    public static function forOverpayment(Order $order, \App\Models\Payment $payment, float $amount): ?RefundRequest
    {
        $amount = round($amount, 2);
        if ($amount <= 0 || ! $order->customer_id || ! $order->store_id) {
            return null;
        }
        if ($existing = RefundRequest::where('payment_id', $payment->id)->first()) {
            return $existing;
        }
        try {
            $refund = RefundRequest::create([
                'order_id'             => $order->id,
                'payment_id'           => $payment->id,
                'customer_id'          => $order->customer_id,
                'store_id'             => $order->store_id,
                'amount'               => $amount,
                'reason'               => 'overpayment',
                'preferred_resolution' => 'money_refund',
                'description'          => "Order {$order->order_number} was paid twice / overpaid: an online payment of ₱" . number_format((float) $payment->amount, 2)
                    . ' (PayMongo ' . ($payment->paymongo_payment_id ?: $payment->paymongo_checkout_id) . ') arrived when only ₱'
                    . number_format(max(0, (float) $payment->amount - $amount), 2) . ' was still owed. Refund ₱' . number_format($amount, 2) . '.',
                'status'               => 'pending',
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            return RefundRequest::where('payment_id', $payment->id)->first();   // the other caller won the race
        }

        NotificationService::sendToStore($order->store_id, 'refund_request', 'Refund to send (paid twice)',
            "Order {$order->order_number} was overpaid online. Send ₱" . number_format($amount, 2) . ' back and record the reference in Refunds.',
            ['order_id' => $order->id, 'link' => '/seller/refunds']);
        static::notifyCustomer($refund, 'refund_request', 'You paid more than your order',
            "Order {$order->order_number}: we received ₱" . number_format($amount, 2) . ' more than you owed. The store will refund it.');

        return $refund;
    }

    /** All order-cancelled refunds of the order are sent → the order's payment_status becomes refunded. */
    public static function syncCancelledOrderStatus(?Order $order): void
    {
        if (! $order || $order->status !== 'cancelled' || $order->payment_status !== 'to_refund') {
            return;
        }
        $open = RefundRequest::where('order_id', $order->id)->where('reason', 'order_cancelled')->whereIn('status', ['pending', 'approved'])->exists();
        if (! $open) {
            $order->update(['payment_status' => 'refunded']);
        }
    }

    /** The seller's "Mark as refunded" on the order page also closes its pending order-cancelled refund requests. */
    public static function closeCancelledOrderRefunds(Order $order, int $actingUserId, ?string $reference = null): void
    {
        RefundRequest::where('order_id', $order->id)->where('reason', 'order_cancelled')->where('status', 'pending')
            ->each(fn (RefundRequest $r) => $r->update([
                'status'              => 'processed',
                'seller_resolution'   => 'money_refund',
                'refund_reference'    => $reference ?: 'Marked refunded on the order page',
                'seller_responded_at' => now(),
                'processed_at'        => now(),
            ]));
    }

    public static function accept(RefundRequest $refund, string $resolution, array $data, int $actingUserId): void
    {
        // A cancelled order has nothing to replace — its money goes back (or as store credit)
        if (in_array($refund->reason, ['order_cancelled', 'overpayment'], true) && $resolution === 'replacement') {
            throw new \RuntimeException('This order was cancelled — send the money back (Money Refund) or give a Store Discount.');
        }

        DB::transaction(function () use ($refund, $resolution, $data, $actingUserId) {
            $base = [
                'seller_resolution'   => $resolution,
                'seller_notes'        => $data['seller_notes'] ?? null,
                'return_method'       => $data['return_method'] ?? null,
                'seller_responded_at' => now(),
            ];

            match ($resolution) {
                'replacement'    => static::sendReplacement($refund, $base, (int) $data['rider_id'], $actingUserId),
                'money_refund'   => $refund->update($base + [
                    'status'           => 'processed',
                    'refund_reference' => $data['refund_reference'],
                    'processed_at'     => now(),
                ]),
                'store_discount' => static::issueCoupon($refund, $base, (float) $data['discount_amount'], (int) ($data['discount_valid_days'] ?? 30)),
            };
        });

        $refund->refresh()->loadMissing(['order', 'customer', 'coupon']);
        static::syncCancelledOrderStatus($refund->order);   // J5: last cancelled-order refund sent → order 'refunded'
        $orderNo = $refund->order?->order_number;

        $message = match ($resolution) {
            'replacement'    => "Your refund request for order #{$orderNo} was accepted. A replacement is on its way.",
            'money_refund'   => "Your refund of ₱" . number_format((float) $refund->amount, 2) . " for order #{$orderNo} was sent by the seller. Reference #: {$refund->refund_reference}.",
            'store_discount' => "Your refund request for order #{$orderNo} was accepted. Use coupon {$refund->coupon?->code} for ₱"
                . number_format((float) $refund->coupon?->amount, 2) . " off your next order from this store.",
        };

        static::notifyCustomer($refund, 'refund_approved', 'Refund Request Accepted', $message);
    }

    public static function reject(RefundRequest $refund, string $reason): void
    {
        $refund->update([
            'status'              => 'rejected',
            'seller_notes'        => $reason,
            'seller_responded_at' => now(),
        ]);

        static::notifyCustomer(
            $refund,
            'refund_rejected',
            'Refund Request Rejected',
            "The seller rejected your refund request for order #{$refund->order?->order_number}. Reason: {$reason}. You may escalate this to the platform admin if you disagree."
        );
    }

    /** Called when the replacement delivery is marked delivered. */
    public static function completeReplacement(RefundRequest $refund): void
    {
        $refund->update(['status' => 'processed', 'processed_at' => now()]);

        static::notifyCustomer(
            $refund,
            'refund_approved',
            'Replacement Delivered',
            "Your replacement for order #{$refund->order?->order_number} has been delivered. This refund request is now resolved."
        );
    }

    // ─────────────────────────────────────────────────────────────────────────

    private static function sendReplacement(RefundRequest $refund, array $base, int $riderId, int $actingUserId): void
    {
        // The replacement rider needs an approved, unexpired driver's license
        $rider = \App\Models\User::find($riderId);
        if ($rider && ($why = \App\Services\StaffDocumentService::assignmentError($rider))) {
            throw new \RuntimeException($why);
        }

        $original = $refund->order()->with('items.product')->firstOrFail();

        // Capacity: the rider's shift vehicle must carry the replacement (same items) on top of its active deliveries
        if ($rider) {
            \App\Services\RiderLoadService::lockShift($rider);
            if ($why = \App\Services\RiderLoadService::canTake($rider, [$original])) {
                throw new \RuntimeException($why);
            }
        }

        foreach ($original->items as $item) {
            $inventory = Inventory::where('product_id', $item->product_id)->lockForUpdate()->first();
            if (! $inventory || $inventory->quantity < $item->quantity) {
                throw new \RuntimeException('Not enough stock to send a replacement for ' . ($item->product?->name ?? 'this item') . '.');
            }
        }

        $replacement = Order::create([
            'store_id'         => $original->store_id,
            'refund_window_days' => $original->refund_window_days, // same window as the original order
            'order_number'     => static::generateOrderNumber(),
            'customer_id'      => $original->customer_id,
            'transaction_type' => $original->transaction_type,
            'status'           => 'out_for_delivery',
            'total_amount'     => 0,
            'shipping_fee'     => 0,
            'payment_method'   => null,
            'payment_status'   => 'paid',
            'payment_mode'     => 'full',
            'notes'            => "Replacement for order #{$original->order_number} (refund request #{$refund->id})",
            'ordered_at'       => now(),
            'created_by'       => $actingUserId,
            'delivery_latitude'  => $original->delivery_latitude,
            'delivery_longitude' => $original->delivery_longitude,
            'delivery_distance_km' => $original->delivery_distance_km,
            'delivery_address'   => $original->delivery_address,
            'delivery_barangay'  => $original->delivery_barangay,
            'delivery_city'      => $original->delivery_city,
            // A replacement always goes out with a rider (even when the original was picked up), no empty tanks
            'fulfillment'          => 'delivery',
            'empty_tanks_required' => 0,
        ]);

        // Original was a pick-up (no address/pin): place it at the customer's profile address
        if ($replacement->delivery_latitude === null || $replacement->delivery_longitude === null) {
            \App\Services\DeliveryRouteService::geocodeOrder($replacement);
            if ($replacement->fresh()->delivery_latitude === null) {
                throw new \RuntimeException("Add the customer's address first — the replacement needs a delivery address.");
            }
        }

        foreach ($original->items as $item) {
            OrderItem::create([
                'order_id'   => $replacement->id,
                'product_id' => $item->product_id,
                'quantity'   => $item->quantity,
                'unit_price' => 0,
                'subtotal'   => 0,
                'transaction_type' => $item->transaction_type ?? $original->transaction_type,
            ]);

            Inventory::where('product_id', $item->product_id)->decrement('quantity', $item->quantity);
            InventoryTransaction::create([
                'product_id' => $item->product_id,
                'type'       => 'order',
                'quantity'   => $item->quantity,
                'reference'  => $replacement->order_number,
                'notes'      => "Replacement for {$original->order_number}",
                'user_id'    => $actingUserId,
            ]);
        }

        $delivery = Delivery::create([
            'order_id'    => $replacement->id,
            'store_id'    => $original->store_id,
            'rider_id'    => $riderId,
            'vehicle_id'  => $rider ? \App\Services\RiderLoadService::currentVehicle($rider)?->id : null,
            'status'      => 'assigned',
            'assigned_at' => now(),
            'notes'       => $base['return_method'] === 'rider_pickup'
                ? 'Replacement delivery — collect the defective item from the customer.'
                : 'Replacement delivery.',
        ]);

        $refund->update($base + [
            'status'                  => 'approved',
            'replacement_order_id'    => $replacement->id,
            'replacement_delivery_id' => $delivery->id,
        ]);

        NotificationService::send(
            $riderId,
            'order_update',
            'New Delivery Assigned',
            "You have been assigned to deliver replacement order #{$replacement->order_number}.",
            ['link' => '/rider/deliveries']
        );
    }

    private static function issueCoupon(RefundRequest $refund, array $base, float $amount, int $validDays): void
    {
        StoreCoupon::create([
            'store_id'          => $refund->store_id,
            'customer_id'       => $refund->customer_id,
            'refund_request_id' => $refund->id,
            'code'              => StoreCoupon::generateCode(),
            'amount'            => round($amount, 2),
            'status'            => 'active',
            'expires_at'        => now()->addDays(max(1, $validDays))->toDateString(),
        ]);

        $refund->update($base + [
            'status'       => 'processed',
            'processed_at' => now(),
        ]);
    }

    private static function notifyCustomer(RefundRequest $refund, string $type, string $title, string $message): void
    {
        $refund->loadMissing('customer');
        $userId = $refund->customer?->user_id;
        if ($userId && User::whereKey($userId)->exists()) {
            NotificationService::send($userId, $type, $title, $message, [
                'refund_id' => $refund->id,
                'link'      => '/customer/refunds',
            ]);
        }
    }

    private static function generateOrderNumber(): string
    {
        $year  = date('Y');
        $count = Order::withTrashed()->whereYear('created_at', $year)->count();
        return 'ORD-' . $year . '-' . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }
}
