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

    public static function accept(RefundRequest $refund, string $resolution, array $data, int $actingUserId): void
    {
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
        $original = $refund->order()->with('items')->firstOrFail();

        foreach ($original->items as $item) {
            $inventory = Inventory::where('product_id', $item->product_id)->lockForUpdate()->first();
            if (! $inventory || $inventory->quantity < $item->quantity) {
                throw new \RuntimeException('Not enough stock to send a replacement for ' . ($item->product?->name ?? 'this item') . '.');
            }
        }

        $replacement = Order::create([
            'store_id'         => $original->store_id,
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
        ]);

        foreach ($original->items as $item) {
            OrderItem::create([
                'order_id'   => $replacement->id,
                'product_id' => $item->product_id,
                'quantity'   => $item->quantity,
                'unit_price' => 0,
                'subtotal'   => 0,
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
