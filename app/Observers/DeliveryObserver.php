<?php

namespace App\Observers;

use App\Events\DeliveryUpdated;
use App\Models\Delivery;
use App\Services\ChatService;
use App\Support\Realtime;
use Illuminate\Support\Facades\Log;

/**
 * The rider in the customer's chat follows the delivery, whichever screen changed it
 * (rider list / map popup, seller, admin, API, batch assign):
 *  - assigned / reassigned → rider joins the customer↔store chat + automatic intro
 *  - picked up / in transit / delivered / failed → automatic rider update
 *  - delivered / failed / reassigned → rider leaves the chat
 * Never blocks the delivery change (errors are logged).
 */
class DeliveryObserver
{
    public function created(Delivery $delivery): void
    {
        if ($delivery->rider_id) {
            $this->riderAssigned($delivery);
        }
        if ($delivery->status !== 'assigned') {
            $this->statusUpdate($delivery);
        }
        $this->broadcast($delivery);
    }

    public function updated(Delivery $delivery): void
    {
        if ($delivery->wasChanged('rider_id')) {
            $old = $delivery->getOriginal('rider_id');
            if ($old) {
                $this->safely($delivery, 'leave', fn () => ChatService::riderLeave($delivery, (int) $old));
            }
            if ($delivery->rider_id) {
                $this->riderAssigned($delivery);
            }
        }
        if ($delivery->wasChanged('status')) {
            $this->statusUpdate($delivery);
        }
        if ($delivery->wasChanged(['status', 'rider_id'])) {
            $this->broadcast($delivery);
        }
    }

    private function riderAssigned(Delivery $delivery): void
    {
        $this->safely($delivery, 'join', function () use ($delivery) {
            $delivery->loadMissing(['order.customer', 'rider']);
            $order = $delivery->order;
            if (! $order) {
                return;
            }

            if ($access = ChatService::riderJoin($delivery)) {
                ChatService::automatic($access->conversation, 'rider', $delivery->rider_id,
                    "Hi! I'm " . ChatService::firstName($delivery->rider) . ", your rider for order {$order->order_number}. I'll update you here.",
                    $order->id, "delivery_assigned_{$delivery->rider_id}");
            }

            // Dispatch note in the private store↔rider chat
            $storeId = $delivery->store_id ?? $order->store_id;
            if ($storeId) {
                $addr  = $order->deliveryAddressParts();
                $place = collect([$addr['barangay'] ?? null, $addr['city'] ?? null])->filter()->implode(', ');
                ChatService::system(
                    ChatService::storeRiderConversation($storeId, $delivery->rider_id),
                    "New delivery assigned: {$order->order_number} — " . ($order->customer?->name ?? 'Customer') . ($place ? ", {$place}" : '') . '.',
                    $order->id,
                );
            }
        });
    }

    private function statusUpdate(Delivery $delivery): void
    {
        $this->safely($delivery, 'status', function () use ($delivery) {
            $delivery->loadMissing(['order.customer', 'order.store']);
            $order = $delivery->order;
            if (! $order || ! $delivery->rider_id) {
                return;
            }
            $n = $order->order_number;
            [$kind, $body] = match ($delivery->status) {
                'picked_up'  => ['delivery_picked_up', "I've picked up your order {$n} from " . ($order->store?->store_name ?? 'the store') . '. Heading your way soon.'],
                'in_transit' => ['delivery_in_transit', "I'm on the way with your order {$n}."
                    . ($order->estimated_delivery_minutes ? " Estimated arrival: about {$order->estimated_delivery_minutes} minutes." : '')],
                'delivered'  => ['delivery_delivered', "Your order {$n} has been delivered. Thank you!" . OrderObserver::balanceNote($order->refresh())],
                'failed'     => ['delivery_failed', "I wasn't able to complete the delivery of order {$n}. The store will contact you."],
                default      => [null, null],
            };
            if (! $kind) {
                return;
            }

            if ($chat = ChatService::conversationForOrder($order)) {
                // Post while the rider is still in the chat, then they leave
                ChatService::automatic($chat, 'rider', $delivery->rider_id, $body, $order->id, $kind);
                if (in_array($delivery->status, ['delivered', 'failed'], true)) {
                    ChatService::riderLeave($delivery, $delivery->rider_id);
                }
            }
        });
    }

    private function broadcast(Delivery $delivery): void
    {
        $this->safely($delivery, 'broadcast', function () use ($delivery) {
            $delivery->loadMissing('order.customer');
            $channels = ['store.' . ($delivery->store_id ?? $delivery->order?->store_id)];
            if ($delivery->rider_id) {
                $channels[] = "user.{$delivery->rider_id}";
            }
            if ($old = $delivery->getOriginal('rider_id')) {
                $channels[] = "user.{$old}";   // the previous rider's list drops it
            }
            if ($userId = $delivery->order?->customer?->user_id) {
                $channels[] = "user.{$userId}";
            }
            Realtime::send(new DeliveryUpdated([
                'delivery_id' => $delivery->id,
                'order_id'    => $delivery->order_id,
                'status'      => $delivery->status,
                'rider_id'    => $delivery->rider_id,
            ], $channels));
        });
    }

    private function safely(Delivery $delivery, string $what, callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            Log::warning("Chat delivery {$what} failed", ['delivery_id' => $delivery->id, 'error' => $e->getMessage()]);
        }
    }
}
