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
        DB::transaction(function () use ($order, $reason, $notes, $userId) {
            // Restore stock if order was already confirmed (stock was deducted)
            if ($order->status === 'confirmed') {
                $order->load('items');
                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    if ($inventory) {
                        $inventory->increment('quantity', $item->quantity);
                        InventoryTransaction::create([
                            'product_id' => $item->product_id,
                            'type'       => 'cancelled',
                            'quantity'   => $item->quantity,
                            'reference'  => $order->order_number,
                            'notes'      => 'Order cancelled by customer — stock restored',
                            'user_id'    => $userId,
                        ]);
                    }
                }
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

        // Loyalty: a customer cancellation lowers their trust score at this store
        LoyaltyService::recordCancelled($order->fresh());
    }
}
