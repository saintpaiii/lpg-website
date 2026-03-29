<?php

namespace App\Services;

use App\Models\Order;
use App\Models\SellerWallet;
use App\Models\Store;
use App\Models\WalletTransaction;

class WalletService
{
    /**
     * Credit the seller's wallet for a completed order.
     * Safe to call multiple times — idempotent via order_id check.
     */
    public static function creditOrder(Order $order): void
    {
        // Prevent double-credit
        if (WalletTransaction::where('order_id', $order->id)->where('type', 'credit')->exists()) {
            return;
        }

        $store = Store::find($order->store_id);
        if (! $store) {
            return;
        }

        $commissionRate = (float) ($store->commission_rate ?? 5.0);
        $subtotal       = (float) $order->total_amount;
        $commission     = round($subtotal * $commissionRate / 100, 2);
        $netAmount      = round($subtotal - $commission, 2);

        if ($netAmount <= 0) {
            return;
        }

        $wallet = SellerWallet::firstOrCreate(
            ['store_id' => $store->id],
            [
                'balance'          => 0.00,
                'total_earned'     => 0.00,
                'total_withdrawn'  => 0.00,
                'total_commission' => 0.00,
            ]
        );

        $newBalance = round((float) $wallet->balance + $netAmount, 2);

        WalletTransaction::create([
            'store_id'        => $store->id,
            'order_id'        => $order->id,
            'type'            => 'credit',
            'amount'          => $netAmount,
            'commission'      => $commission,
            'running_balance' => $newBalance,
            'description'     => "Order #{$order->order_number} completed",
        ]);

        $wallet->update([
            'balance'          => $newBalance,
            'total_earned'     => round((float) $wallet->total_earned + $netAmount, 2),
            'total_commission' => round((float) $wallet->total_commission + $commission, 2),
        ]);
    }
}
