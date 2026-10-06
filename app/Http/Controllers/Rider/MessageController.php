<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Chat\BaseMessageController;
use App\Models\ConversationRiderAccess;
use App\Models\Delivery;
use App\Services\ChatService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Rider inbox: the chat with their store + the customer chats they're in for active deliveries. */
class MessageController extends BaseMessageController
{
    protected function portal(): string
    {
        return 'rider';
    }

    protected function page(): string
    {
        return 'rider/messages';
    }

    /** ?delivery_id → that customer's chat (joining it if needed); otherwise → my store. */
    public function start(Request $request): RedirectResponse
    {
        $user = $request->user();
        $deliveryId = $request->integer('delivery_id');

        if ($deliveryId) {
            $delivery = Delivery::with('order.customer')->findOrFail($deliveryId);
            abort_unless($delivery->rider_id === $user->id, 403);

            $chat = ChatService::conversationForOrder($delivery->order);
            if (! $chat) {
                return back()->with('error', 'This customer has no online account to message. Please call them instead.');
            }
            $active = ConversationRiderAccess::where('conversation_id', $chat->id)->where('delivery_id', $delivery->id)
                ->where('rider_id', $user->id)->whereNull('ended_at')->exists();
            if (! $active) {
                if (! in_array($delivery->status, ['assigned', 'picked_up', 'in_transit'], true)) {
                    return back()->with('error', 'This delivery is already finished.');
                }
                ChatService::riderJoin($delivery);   // e.g. assigned before chat existed
            }

            return $this->openChat($chat);
        }

        if (! $user->store_id) {
            return back()->with('error', 'You are not assigned to a store yet.');
        }

        return $this->openChat(ChatService::storeRiderConversation($user->store_id, $user->id));
    }
}
