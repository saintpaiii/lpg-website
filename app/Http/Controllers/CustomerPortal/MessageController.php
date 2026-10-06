<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Chat\BaseMessageController;
use App\Models\Conversation;
use App\Models\Delivery;
use App\Models\Store;
use App\Services\ChatService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Customer inbox: one chat per store; the rider joins it while delivering. */
class MessageController extends BaseMessageController
{
    protected function portal(): string
    {
        return 'customer';
    }

    protected function page(): string
    {
        return 'customer/messages';
    }

    /** Open (or create) the chat with a store: ?store_id, or ?delivery_id (→ that order's store chat). */
    public function start(Request $request): RedirectResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'store_id'    => ['nullable', 'integer', 'required_without:delivery_id'],
            'delivery_id' => ['nullable', 'integer', 'required_without:store_id'],
        ]);

        $storeId = $data['store_id'] ?? null;
        if (! empty($data['delivery_id'])) {
            $delivery = Delivery::with('order.customer')->findOrFail($data['delivery_id']);
            abort_unless($delivery->order?->customer?->user_id === $user->id, 403);
            $storeId = $delivery->store_id ?? $delivery->order->store_id;
        }

        $store = Store::findOrFail($storeId);
        if ($store->user_id === $user->id) {
            return back()->with('error', "You can't message your own store.");
        }
        $existing = Conversation::where('type', Conversation::CUSTOMER_STORE)
            ->where('store_id', $store->id)->where('customer_id', $user->id)->first();
        if (! $existing && ! $store->canReceiveMessages()) {
            return back()->with('error', 'This store is currently unavailable.');
        }

        return $this->openChat($existing ?? ChatService::customerStoreConversation($user->id, $store->id));
    }
}
