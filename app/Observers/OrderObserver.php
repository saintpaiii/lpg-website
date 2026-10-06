<?php

namespace App\Observers;

use App\Events\OrderUpdated;
use App\Models\Order;
use App\Services\ChatService;
use App\Support\Realtime;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Order updates in the customer↔store chat (as automatic store messages) + live order events,
 * whichever screen, API or job changed the order. Chat/Pusher problems are logged and swallowed —
 * they must never block an order change.
 */
class OrderObserver
{
    public function created(Order $order): void
    {
        // Checkout saves the items after the order row, inside a transaction — wait for the commit
        DB::afterCommit(function () use ($order) {
            $this->say($order, 'order_created', function () use ($order) {
                $order->load(['items.product', 'customer.user']);

                return 'Thank you for your order, ' . $this->customerFirstName($order) . "! We received order {$order->order_number}"
                    . (($items = $this->itemSummary($order)) ? " — {$items}" : '')
                    . ' — total ₱' . number_format($order->grandTotal(), 2) . ". We'll confirm it shortly.";
            });
            $this->broadcast($order, true);
        });
    }

    public function updated(Order $order): void
    {
        if ($order->wasChanged('status')) {
            $n = $order->order_number;
            match ($order->status) {
                'confirmed'        => $this->say($order, 'order_confirmed', fn () => "Your order {$n} is confirmed. We're getting it ready."),
                'preparing'        => $this->say($order, 'order_preparing', fn () => "We're preparing your order {$n} now."),
                // With a rider assigned, the rider's own updates cover these two
                'out_for_delivery' => $this->hasDelivery($order) ? null
                    : $this->say($order, 'order_out_for_delivery', fn () => "Your order {$n} is on its way."),
                'delivered'        => $this->hasDelivery($order) ? null
                    : $this->say($order, 'order_delivered', fn () => "Your order {$n} has been delivered. Thank you for buying from "
                        . ($order->store?->store_name ?? 'us') . '!' . static::balanceNote($order)),
                'cancelled'        => $this->say($order, 'order_cancelled', fn () => "Your order {$n} was cancelled."
                    . ($order->cancellation_reason ? " Reason: {$order->cancellation_reason}" : '')),
                default            => null,
            };
        }

        if ($order->wasChanged(['status', 'payment_status', 'remaining_balance'])) {
            $this->broadcast($order, false);
        }
    }

    /** " Remaining balance: ₱X due on M d, Y." for consignment orders with a balance. */
    public static function balanceNote(Order $order): string
    {
        if ($order->payment_mode !== 'consignment' || (float) $order->remaining_balance <= 0) {
            return '';
        }

        return ' Remaining balance: ₱' . number_format((float) $order->remaining_balance, 2)
            . ($order->balance_due_date ? ' due on ' . $order->balance_due_date->format('M d, Y') : '') . '.';
    }

    private function hasDelivery(Order $order): bool
    {
        return $order->delivery()->exists();
    }

    /** Post an automatic store message (once per order + kind). */
    private function say(Order $order, string $kind, callable $body): void
    {
        try {
            if ($chat = ChatService::conversationForOrder($order->loadMissing('customer'))) {
                ChatService::automatic($chat, 'store', null, $body(), $order->id, $kind);
            }
        } catch (\Throwable $e) {
            Log::warning('Chat order update failed', ['order_id' => $order->id, 'kind' => $kind, 'error' => $e->getMessage()]);
        }
    }

    private function broadcast(Order $order, bool $isNew): void
    {
        try {
            $channels = ["store.{$order->store_id}"];
            if ($userId = $order->loadMissing('customer')->customer?->user_id) {
                $channels[] = "user.{$userId}";
            }
            Realtime::send(new OrderUpdated([
                'order_id'          => $order->id,
                'order_number'      => $order->order_number,
                'status'            => $order->status,
                'payment_status'    => $order->payment_status,
                'remaining_balance' => (float) $order->remaining_balance,
                'is_new'            => $isNew,
            ], $channels));
        } catch (\Throwable $e) {
            Log::warning('Order live update failed', ['order_id' => $order->id, 'error' => $e->getMessage()]);
        }
    }

    private function customerFirstName(Order $order): string
    {
        $user = $order->customer?->user;

        return $user?->first_name ?: (strtok((string) ($order->customer?->name ?? ''), ' ') ?: 'there');
    }

    /** "2× 11kg Petron Gasul, 1× Regulator +2 more" */
    private function itemSummary(Order $order): string
    {
        $items = $order->items;
        $parts = $items->take(3)->map(fn ($i) => ((int) $i->quantity) . '× ' . ($i->product?->name ?? 'Item'))->implode(', ');

        return $parts . ($items->count() > 3 ? ' +' . ($items->count() - 3) . ' more' : '');
    }
}
