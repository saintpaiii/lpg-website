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
                'paid_amount'    => $order->total_amount,
                'paid_at'        => $invoice->paid_at ?? now(),
                'payment_method' => $method ?? $invoice->payment_method ?? $order->payment_method,
            ]);
        }

        static::recordCommission($order->fresh());
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

        $subtotal = round((float) $order->total_amount, 2);
        if ($subtotal <= 0) {
            return null; // e.g. ₱0 replacement orders
        }

        $order->loadMissing('store');
        $rate       = (float) ($order->store?->commission_rate ?: Commission::DEFAULT_RATE);
        $commission = round($subtotal * $rate / 100, 2);

        return Commission::create([
            'order_id'          => $order->id,
            'store_id'          => $order->store_id,
            'order_total'       => $subtotal,
            'commission_rate'   => $rate,
            'commission_amount' => $commission,
            'seller_amount'     => round($subtotal - $commission, 2),
            'status'            => 'pending',
        ]);
    }
}
