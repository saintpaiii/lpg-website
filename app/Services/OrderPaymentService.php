<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RefundRequest;

/**
 * Single place for order payment / delivery side effects:
 *  - marking an order fully paid (and syncing its invoice)
 *  - consignment balance due dates when an order is delivered
 *  - commission records once an order is both delivered AND paid
 *
 * The platform never holds seller money — commissions are tracked here as
 * receivables the admin settles with each store.
 */
class OrderPaymentService
{
    /**
     * Mark an order as fully paid. Safe to call more than once.
     */
    public static function markPaid(Order $order, ?string $method = null): void
    {
        $settlesConsignment = $order->payment_mode === 'consignment' && $order->payment_status === 'partial';

        $updates = ['payment_status' => 'paid'];
        if ($method) {
            $updates['payment_method'] = $method;
        }
        if ($order->payment_mode === 'consignment') {
            $updates['remaining_balance'] = 0;
        }
        $order->update($updates);

        if ($invoice = $order->invoice) {
            $invoice->update([
                'payment_status' => 'paid',
                'paid_amount'    => $order->grandTotal(), // items + delivery fee
                'paid_at'        => $invoice->paid_at ?? now(),
                'payment_method' => $method ?? $invoice->payment_method ?? $order->payment_method,
            ]);
        }

        static::recordCommission($order->fresh());

        // Loyalty: consignment balance settled — on time or late
        if ($settlesConsignment) {
            LoyaltyService::recordBalancePaid($order->fresh());
        }
    }

    /**
     * Apply a confirmed PayMongo payment to its order.
     * Consignment: first payment is the down payment (→ partial), the next settles the balance.
     *
     * @return string The order's new payment_status
     */
    public static function applyOnlinePayment(Order $order, ?string $method): string
    {
        $order->loadMissing('store');

        if ($order->payment_mode === 'consignment' && $order->payment_status === 'unpaid') {
            $order->update([
                'payment_status' => 'partial',
                'payment_method' => $method,
            ]);

            if ($order->invoice) {
                $order->invoice->update([
                    'payment_status' => 'partial',
                    'paid_amount'    => (float) ($order->down_payment_amount ?? 0),
                    'payment_method' => $method,
                ]);
            }

            if ($order->store) {
                $days = (int) ($order->store->consignment_due_days ?: 7);
                NotificationService::sendToStore(
                    $order->store->id,
                    'payment',
                    'Down Payment Received',
                    "Order {$order->order_number} — down payment received. ₱" . number_format((float) $order->remaining_balance, 2)
                        . " balance is due {$days} day(s) after delivery. You may proceed with the order.",
                    ['order_id' => $order->id, 'link' => '/seller/orders/' . $order->id]
                );
            }

            return 'partial';
        }

        $wasPartial = $order->payment_status === 'partial';
        static::markPaid($order, $method);

        if ($wasPartial && $order->store) {
            NotificationService::sendToStore(
                $order->store->id,
                'payment',
                'Consignment Balance Paid',
                "Order {$order->order_number} — the customer has paid the remaining balance. The order is now fully paid.",
                ['order_id' => $order->id, 'link' => '/seller/orders/' . $order->id]
            );
        }

        return 'paid';
    }

    /**
     * Run after an order has been marked delivered (from any portal / API).
     * Pass the delivery when known so replacement deliveries can close their refund.
     */
    public static function handleDelivered(Order $order, ?Delivery $delivery = null): void
    {
        $order->loadMissing(['store', 'customer']);

        // Consignment: start the balance countdown from the delivery date
        if ($order->payment_mode === 'consignment'
            && $order->payment_status === 'partial'
            && ! $order->balance_due_date) {
            $days    = (int) ($order->store?->consignment_due_days ?: 7);
            $dueDate = ($order->delivered_at ?? now())->copy()->startOfDay()->addDays($days);

            $order->update(['balance_due_date' => $dueDate->toDateString()]);

            $customerUserId = $order->customer?->user_id;
            if ($customerUserId) {
                NotificationService::send(
                    $customerUserId,
                    'payment',
                    'Balance Due for Your Order',
                    "Order {$order->order_number} was delivered. Please pay the remaining balance of ₱"
                        . number_format((float) $order->remaining_balance, 2)
                        . ' on or before ' . $dueDate->format('M d, Y') . '.',
                    ['order_id' => $order->id, 'link' => '/customer/orders/' . $order->id]
                );
            }
        }

        static::recordCommission($order->fresh());

        // Loyalty: count the completed order toward the customer's tier at this store
        LoyaltyService::recordDelivered($order->fresh());

        // A delivered replacement completes the refund it belongs to
        $deliveryId = $delivery?->id ?? $order->delivery?->id;
        if ($deliveryId) {
            $refund = RefundRequest::where('replacement_delivery_id', $deliveryId)
                ->where('status', 'approved')
                ->first();
            if ($refund) {
                RefundService::completeReplacement($refund);
            }
        }
    }

    /**
     * Create the commission record for an order that is delivered and fully paid.
     * Idempotent — one commission per order.
     */
    public static function recordCommission(Order $order): ?Commission
    {
        if ($order->status !== 'delivered' || $order->payment_status !== 'paid' || ! $order->store_id) {
            return null;
        }

        if ($existing = Commission::where('order_id', $order->id)->first()) {
            return $existing;
        }

        $order->loadMissing(['store', 'coupon', 'items']);

        $subtotal = round((float) $order->total_amount, 2);
        $coupon   = (float) $order->coupon_discount > 0 ? $order->coupon : null;

        // With a promo coupon, commission is charged on the original items price
        // (before the coupon), not on what the customer paid.
        $commissionBase = $coupon
            ? round((float) $order->items->sum('subtotal') - (float) $order->discount_amount, 2)
            : $subtotal;

        if ($commissionBase <= 0) {
            return null; // e.g. ₱0 replacement orders
        }

        $rate = (float) ($order->store?->commission_rate ?: Commission::DEFAULT_RATE);

        // Platform coupon: cost is shared. The store pays the promo commission rate on
        // the original price, and the platform's share of the discount is credited back
        // against that commission (a negative amount is a credit carried to the next
        // commission invoice — the platform holds no seller funds to pay it out).
        if ($coupon?->type === 'platform') {
            $use       = \App\Models\CouponUse::where('order_id', $order->id)->where('coupon_id', $coupon->id)->first();
            $promoRate = (float) ($use?->commission_rate ?? CouponService::promoCommissionRate($coupon, $rate));
            $adminCut  = (float) ($use?->admin_absorbed ?? CouponService::split($coupon, (float) $order->coupon_discount)['admin']);
            $gross     = round($commissionBase * $promoRate / 100, 2);
            $net       = round($gross - $adminCut, 2);

            return Commission::create([
                'order_id'          => $order->id,
                'store_id'          => $order->store_id,
                'order_total'       => $subtotal,
                'commission_rate'   => $promoRate,
                'commission_amount' => $net,
                'seller_amount'     => round($subtotal - $net, 2),
                'status'            => 'pending',
                'notes'             => "Platform coupon {$coupon->code}: {$promoRate}% promo commission on ₱" . number_format($commissionBase, 2)
                    . ' = ₱' . number_format($gross, 2) . ', less ₱' . number_format($adminCut, 2) . ' platform share of the discount'
                    . ($net < 0 ? ' (credit of ₱' . number_format(abs($net), 2) . ' to the store)' : ''),
            ]);
        }

        $commission = round($commissionBase * $rate / 100, 2);

        return Commission::create([
            'order_id'          => $order->id,
            'store_id'          => $order->store_id,
            'order_total'       => $subtotal,
            'commission_rate'   => $rate,
            'commission_amount' => $commission,
            'seller_amount'     => round($subtotal - $commission, 2),
            'status'            => 'pending',
            'notes'             => $coupon
                ? "Store coupon {$coupon->code} — commission on original price ₱" . number_format($commissionBase, 2)
                : null,
        ]);
    }
}
