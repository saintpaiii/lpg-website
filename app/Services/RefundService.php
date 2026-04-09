<?php

namespace App\Services;

use App\Models\CreditTransaction;
use App\Models\RefundRequest;
use App\Models\SellerWallet;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;

class RefundService
{
    /**
     * Process an approved refund: credit customer, optionally deduct from seller wallet.
     */
    public static function processApproved(RefundRequest $refund): void
    {
        DB::transaction(function () use ($refund) {
            // 1. Credit platform_credits to the customer's user account
            $customer = $refund->customer;
            if (! $customer) return;

            $customerUser = User::find($customer->user_id);
            if (! $customerUser) return;

            $newBalance = round((float) $customerUser->platform_credits + (float) $refund->amount, 2);
            $customerUser->increment('platform_credits', (float) $refund->amount);

            CreditTransaction::create([
                'user_id'        => $customerUser->id,
                'type'           => 'refund_credit',
                'amount'         => (float) $refund->amount,
                'balance_after'  => $newBalance,
                'reference_type' => 'refund_request',
                'reference_id'   => $refund->id,
                'description'    => "Refund for order #{$refund->order?->order_number}",
            ]);

            // 2. Deduct from seller wallet if they already received credit for this order
            $sellerWalletTx = WalletTransaction::where('order_id', $refund->order_id)
                ->where('type', 'credit')
                ->first();

            if ($sellerWalletTx) {
                $wallet = SellerWallet::where('store_id', $refund->store_id)->first();

                if ($wallet) {
                    $deductAmount   = min((float) $refund->amount, (float) $wallet->balance);
                    $newWalBal      = round((float) $wallet->balance - $deductAmount, 2);
                    $pendingRecovery = round((float) $refund->amount - $deductAmount, 2);

                    WalletTransaction::create([
                        'store_id'        => $refund->store_id,
                        'order_id'        => $refund->order_id,
                        'type'            => 'refund_deduction',
                        'amount'          => -$deductAmount,
                        'commission'      => 0,
                        'running_balance' => $newWalBal,
                        'description'     => "Refund deduction for order #{$refund->order?->order_number}",
                    ]);

                    $wallet->update(['balance' => $newWalBal]);

                    // Notify seller of deduction
                    $store = $refund->store;
                    if ($store) {
                        NotificationService::sendToStore(
                            $store->id,
                            'wallet_update',
                            'Refund Deduction from Wallet',
                            "₱" . number_format($deductAmount, 2) . " was deducted from your wallet for a refund on order #{$refund->order?->order_number}.",
                            ['order_id' => $refund->order_id]
                        );

                        // Notify admin if there's a remaining balance that couldn't be deducted
                        if ($pendingRecovery > 0) {
                            NotificationService::sendToRole(
                                'platform_admin',
                                'refund_alert',
                                'Insufficient Seller Balance for Refund',
                                "Store \"{$store->store_name}\" has insufficient balance for refund. Pending recovery: ₱" . number_format($pendingRecovery, 2),
                                ['refund_id' => $refund->id, 'order_id' => $refund->order_id]
                            );
                        }
                    }
                }
            }

            // 3. Mark refund as processed
            $refund->update([
                'status'       => 'processed',
                'processed_at' => now(),
            ]);

            // 4. Notify customer
            NotificationService::send(
                $customerUser->id,
                'refund_approved',
                'Refund Approved',
                "Your refund of ₱" . number_format((float) $refund->amount, 2) . " for order #{$refund->order?->order_number} has been credited to your platform credits.",
                ['refund_id' => $refund->id]
            );
        });
    }

    /**
     * Deduct credits at checkout. Returns the amount deducted.
     */
    public static function deductCreditsForOrder(User $user, float $deductAmount, int $orderId, string $orderNumber): float
    {
        if ($deductAmount <= 0 || (float) $user->platform_credits <= 0) return 0;

        $actual      = min($deductAmount, (float) $user->platform_credits);
        $newBalance  = round((float) $user->platform_credits - $actual, 2);

        $user->decrement('platform_credits', $actual);

        CreditTransaction::create([
            'user_id'        => $user->id,
            'type'           => 'purchase_debit',
            'amount'         => -$actual,
            'balance_after'  => $newBalance,
            'reference_type' => 'order',
            'reference_id'   => $orderId,
            'description'    => "Credits used for order #{$orderNumber}",
        ]);

        return $actual;
    }
}
