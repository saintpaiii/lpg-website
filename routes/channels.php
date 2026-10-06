<?php

use App\Models\Conversation;
use App\Models\Store;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Support\Facades\Broadcast;

/*
| Private channels for live updates (Pusher). Authorised with the web session.
|  - user.{id}          only that user (notifications, unread counts, their orders / deliveries)
|  - conversation.{id}  people who can see that chat. Riders get customer-chat messages on their
|                       own user channel instead (their access is time-boxed), so here riders are
|                       only allowed on store↔rider chats.
|  - store.{id}         the store owner and that store's staff
*/

Broadcast::channel('user.{id}', fn (User $user, int $id) => $user->id === $id);

Broadcast::channel('conversation.{conversation}', function (User $user, Conversation $conversation) {
    $side = ChatService::sideFor($conversation, $user);

    return $side !== null && ! ($side === 'rider' && $conversation->type === Conversation::CUSTOMER_STORE);
});

Broadcast::channel('store.{id}', function (User $user, int $id) {
    return ($user->role === 'seller' && Store::whereKey($id)->where('user_id', $user->id)->exists())
        || ($user->role === 'seller_staff' && $user->store_id === $id);
});
