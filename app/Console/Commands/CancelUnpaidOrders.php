<?php

namespace App\Console\Commands;

use App\Exceptions\PaymentServiceUnavailable;
use App\Models\Order;
use App\Models\Payment;
use App\Services\NotificationService;
use App\Services\OrderCancellationService;
use App\Services\OrderPaymentService;
use App\Services\PayMongoService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Online orders (Full Payment / Consignment) whose PayMongo payment was never completed are
 * cancelled after UNPAID_MINUTES, through the same code path as the customer's "Cancel order".
 *
 * Before cancelling, PayMongo is asked once more: a session that turns out to be paid (webhook
 * missed) is confirmed instead. If PayMongo can't be reached, the order is left for the next run.
 * COD orders and orders with any paid payment are never touched.
 */
class CancelUnpaidOrders extends Command
{
    public const UNPAID_MINUTES = 60;

    protected $signature = 'orders:cancel-unpaid';

    protected $description = 'Cancel online orders whose payment was not completed within ' . self::UNPAID_MINUTES . ' minutes.';

    public function handle(PayMongoService $paymongo): int
    {
        $cancelled = $confirmed = $skipped = 0;

        $orders = Order::whereIn('payment_mode', ['full', 'consignment'])
            ->where('status', 'pending')
            ->where('payment_status', 'unpaid')
            ->whereDoesntHave('payments', fn ($q) => $q->where('status', 'paid'))
            ->where('created_at', '<', now()->subMinutes(self::UNPAID_MINUTES))
            ->with('customer')
            ->get();

        foreach ($orders as $order) {
            try {
                if ($this->paidOnPayMongo($order, $paymongo)) {
                    $confirmed++;
                    continue;
                }
            } catch (PaymentServiceUnavailable $e) {
                // Can't tell whether it was paid — try again next run
                Log::warning('orders:cancel-unpaid: PayMongo unreachable, skipping', ['order_id' => $order->id]);
                $skipped++;
                continue;
            } catch (\Throwable $e) {
                // Never cancel an order we couldn't check
                Log::warning('orders:cancel-unpaid: could not check payment, skipping', ['order_id' => $order->id, 'error' => $e->getMessage()]);
                $skipped++;
                continue;
            }

            // Still unpaid and still pending (the store or the customer may have acted meanwhile)
            $fresh = $order->fresh();
            if (! $fresh || $fresh->status !== 'pending' || $fresh->payment_status !== 'unpaid') {
                continue;
            }

            OrderCancellationService::cancelByCustomer(
                $fresh,
                'Payment not completed within ' . self::UNPAID_MINUTES . ' minutes',
                null,
                null,
            );
            Payment::where('order_id', $fresh->id)->where('status', 'pending')->update(['status' => 'cancelled']);

            $message = "Order #{$fresh->order_number} was cancelled because the payment was not completed.";
            if ($userId = $order->customer?->user_id) {
                NotificationService::send($userId, 'order_update', 'Order cancelled', $message,
                    ['order_id' => $fresh->id, 'link' => '/customer/orders/' . $fresh->id]);
            }
            if ($fresh->store_id) {
                NotificationService::sendToStore($fresh->store_id, 'order_update', 'Order cancelled', $message,
                    ['order_id' => $fresh->id, 'link' => '/seller/orders/' . $fresh->id]);
            }
            $cancelled++;
        }

        $this->info("Cancelled {$cancelled} unpaid order(s), confirmed {$confirmed} paid on PayMongo, skipped {$skipped}.");

        return self::SUCCESS;
    }

    /**
     * Ask PayMongo about the order's pending checkout sessions. A paid one is applied exactly like
     * the webhook does (every order in that checkout session), and true is returned.
     */
    private function paidOnPayMongo(Order $order, PayMongoService $paymongo): bool
    {
        $sessionIds = Payment::where('order_id', $order->id)
            ->where('status', 'pending')
            ->whereNotNull('paymongo_checkout_id')
            ->orderByDesc('created_at')
            ->pluck('paymongo_checkout_id')
            ->unique();

        foreach ($sessionIds as $sessionId) {
            $session = $paymongo->retrieveCheckoutSession($sessionId);
            $first   = ($session['attributes']['payments'] ?? [])[0] ?? null;

            if (($first['attributes']['status'] ?? null) !== 'paid') {
                continue;
            }

            $localMethod = PayMongoService::mapPaymentMethod($first['attributes']['source']['type'] ?? '');

            DB::transaction(function () use ($sessionId, $first, $localMethod) {
                foreach (Payment::where('paymongo_checkout_id', $sessionId)->get() as $payment) {
                    if ($payment->status === 'paid') {
                        continue;
                    }
                    $payment->update([
                        'status'              => 'paid',
                        'paymongo_payment_id' => $first['id'] ?? null,
                        'payment_method'      => $localMethod,
                        'paid_at'             => now(),
                    ]);
                    if ($payment->order) {
                        OrderPaymentService::applyOnlinePayment($payment->order, $localMethod);
                    }
                }
            });

            return true;
        }

        return false;
    }
}
