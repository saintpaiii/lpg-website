<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * A customer-side order cancellation — used by the customer's "Cancel order" button
 * and by orders:cancel-unpaid (online payment never completed).
 */
class OrderCancellationService
{
    public static function cancelByCustomer(Order $order, string $reason, ?string $notes, ?int $userId): void
    {
        // What the customer paid, measured before payment_status becomes to_refund (J5: refunded automatically below)
        $paidBefore = PaymentReceiptService::paidSoFar($order);

        DB::transaction(function () use ($order, $reason, $notes, $userId) {
            // Restore stock if order was already confirmed (stock was deducted)
            if ($order->status === 'confirmed') {
                // Back to the same cylinder batches (J7)
                StockService::returnForOrder($order, $userId, 'Order cancelled by customer — stock restored');
            }

            $cancelUpdates = [
                'status'              => 'cancelled',
                'cancellation_reason' => $reason,
                'cancellation_notes'  => $notes,
                'cancelled_by'        => 'customer',
                'cancelled_at'        => now(),
            ];

            // If already paid (fully or a consignment down payment), flag for refund
            if (in_array($order->payment_status, ['paid', 'partial'])) {
                $cancelUpdates['payment_status'] = 'to_refund';
            }

            $order->update($cancelUpdates);

            // Void invoice if one exists
            if ($order->invoice) {
                $order->invoice->update(['payment_status' => 'voided']);
            }
        });

        // J5: money already paid (Full Payment, half payment, down payment) → one automatic refund request
        if ($paidBefore > 0) {
            RefundService::forCancelledOrder($order, $paidBefore);
        }

        // Loyalty: a customer cancellation lowers their trust score at this store
        LoyaltyService::recordCancelled($order->fresh());
    }
}
