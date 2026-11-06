<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Payment;
use App\Models\RefundRequest;
use Illuminate\Support\Facades\DB;

/**
 * Single place for order payment / delivery side effects:
 *  - marking an order fully paid (and syncing its invoice)
 *  - consignment balance due dates when an order is delivered
 *  - loyalty and refund follow-ups
 *
 * The platform never holds seller money — stores keep the full amount.
 */
class OrderPaymentService
{
    /**
     * Lock the order row and load its latest values into $order (callers keep using their instance).
     * Only effective inside a transaction — every payment path runs in one.
     */
    private static function lockOrder(Order $order): void
    {
        $locked = Order::withTrashed()->whereKey($order->id)->lockForUpdate()->first();
        if ($locked) {
            $order->setRawAttributes($locked->getAttributes(), true);
            $order->unsetRelation('invoice');
        }
    }

    /**
     * Mark an order as fully paid. Safe to call more than once (an already-paid order gets no second receipt).
     * Issues the acknowledgement receipt for the amount still owed before this call, unless $issueReceipt is false
     * (applyOnlinePayment issues its own).
     */
    public static function markPaid(Order $order, ?string $method = null, ?string $source = null, ?string $reference = null, bool $issueReceipt = true): void
    {
        self::lockOrder($order);
        $before = PaymentReceiptService::paidSoFar($order);

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

        // Loyalty: consignment balance settled — on time or late
        if ($settlesConsignment) {
            LoyaltyService::recordBalancePaid($order->fresh());
        }

        if ($issueReceipt) {
            PaymentReceiptService::record($order, $order->grandTotal() - $before, $method, $source ?? 'seller_recorded', $reference);
        }
    }

    /**
     * Apply ONE paid PayMongo checkout row exactly once — used by the webhook, the return-verify and the
     * unpaid-orders job, which can see the same payment at the same time. The Payment row is locked and its status
     * re-checked: the second caller sees 'paid' and does nothing (returns null).
     *
     * @return string|null The order's new payment_status, or null when the row was already applied / has no order
     */
    public static function applyPaidCheckoutRow(int $paymentId, ?string $method, ?string $paymongoPayId): ?string
    {
        return DB::transaction(function () use ($paymentId, $method, $paymongoPayId) {
            $payment = Payment::whereKey($paymentId)->lockForUpdate()->first();
            if (! $payment || $payment->status === 'paid') {
                return null;
            }

            $payment->update([
                'status'              => 'paid',
                'paymongo_payment_id' => $paymongoPayId,
                'payment_method'      => $method,
                'paid_at'             => now(),
            ]);

            $order = $payment->order;
            if (! $order) {
                return null;
            }

            return self::applyOnlinePayment($order, $method, $paymongoPayId, $payment);
        });
    }

    /**
     * Apply a confirmed PayMongo payment to its order.
     * Consignment: first payment is the down payment (→ partial), the next settles the balance.
     *
     * @return string The order's new payment_status
     */
    public static function applyOnlinePayment(Order $order, ?string $method, ?string $reference = null, ?Payment $payment = null): string
    {
        self::lockOrder($order);
        $order->loadMissing('store');
        $before = PaymentReceiptService::paidSoFar($order);

        // The money arrived for an order that is already cancelled / being refunded: leave its statuses alone,
        // acknowledge the money and ask the store to refund it
        if ($order->status === 'cancelled' || in_array($order->payment_status, ['to_refund', 'refunded'], true)) {
            PaymentReceiptService::record($order, (float) ($payment?->amount ?? 0), $method, 'online', $reference, $payment?->id);

            if ($order->store_id) {
                NotificationService::sendToStore(
                    $order->store_id,
                    'payment',
                    'Payment for a Cancelled Order',
                    "Payment received for cancelled order {$order->order_number} — please refund the customer.",
                    ['order_id' => $order->id, 'link' => '/seller/orders/' . $order->id]
                );
            }

            return (string) $order->payment_status;
        }

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

            PaymentReceiptService::record($order, PaymentReceiptService::paidSoFar($order) - $before, $method, 'online', $reference, $payment?->id);

            return 'partial';
        }

        $wasPartial = $order->payment_status === 'partial';
        static::markPaid($order, $method, 'online', $reference, false);
        PaymentReceiptService::record($order, $order->grandTotal() - $before, $method, 'online', $reference, $payment?->id);

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
}
