<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Chat\BaseMessageController;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\CustomerLoyalty;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\StoreLoyaltySettings;
use App\Models\StoreQuickReply;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Store inbox (owner + staff with messages.view): customer chats with a CRM side panel,
 * rider chats for dispatch, and saved quick replies.
 */
class MessageController extends BaseMessageController
{
    protected function portal(): string
    {
        return 'seller';
    }

    protected function page(): string
    {
        return 'seller/messages';
    }

    protected function pageExtras(Request $request): array
    {
        $storeId = $this->storeId($request);

        return [
            'quickReplies' => StoreQuickReply::where('store_id', $storeId)->orderBy('title')->get(['id', 'title', 'body']),
            'canReply'     => $this->canReply($request),
        ];
    }

    /** ?customer_id (customers table) / ?customer_user_id (users) → customer chat; ?rider_id → rider chat. */
    public function start(Request $request): RedirectResponse
    {
        $storeId = $this->storeId($request);
        $data = $request->validate([
            'customer_id'      => ['nullable', 'integer'],
            'customer_user_id' => ['nullable', 'integer'],
            'rider_id'         => ['nullable', 'integer'],
        ]);

        if (! empty($data['rider_id'])) {
            $rider = User::whereKey($data['rider_id'])->where('store_id', $storeId)->where('is_active', true)->first();
            abort_unless($rider && $rider->isRider(), 403);

            return $this->openChat(ChatService::storeRiderConversation($storeId, $rider->id));
        }

        $userId = $data['customer_user_id'] ?? (! empty($data['customer_id']) ? Customer::whereKey($data['customer_id'])->value('user_id') : null);
        if (! $userId) {
            return back()->with('error', 'This customer has no online account to message.');
        }
        // Only customers who have ordered from this store
        $hasOrdered = Order::where('store_id', $storeId)->whereHas('customer', fn ($q) => $q->where('user_id', $userId))->exists();
        abort_unless($hasOrdered, 403);

        return $this->openChat(ChatService::customerStoreConversation($userId, $storeId));
    }

    /** Right-hand panel: who this customer (or rider) is to the store. */
    public function crm(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeView($request, $conversation);
        $storeId = $conversation->store_id;

        if ($conversation->type === Conversation::STORE_RIDER) {
            $rider = $conversation->rider;
            $active = Delivery::where('rider_id', $rider?->id)->where('store_id', $storeId)
                ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])->count();
            $doneToday = Delivery::where('rider_id', $rider?->id)->where('store_id', $storeId)
                ->where('status', 'delivered')->where('delivered_at', '>=', now()->startOfDay())->count();

            return response()->json(['kind' => 'rider', 'rider' => [
                'name' => ChatService::displayName($rider), 'phone' => $rider?->phone,
                'active_deliveries' => $active, 'delivered_today' => $doneToday,
            ]]);
        }

        $user     = $conversation->customer;
        $customer = $user ? Customer::where('user_id', $user->id)->first() : null;
        $orders   = Order::where('store_id', $storeId)->whereHas('customer', fn ($q) => $q->where('user_id', $user?->id));
        $loyaltyOn = (bool) StoreLoyaltySettings::where('store_id', $storeId)->value('is_enabled');
        $loyalty  = $loyaltyOn && $user ? CustomerLoyalty::where('user_id', $user->id)->where('store_id', $storeId)->first() : null;

        $counted = (clone $orders)->where('status', '!=', 'cancelled');

        return response()->json(['kind' => 'customer', 'customer' => [
            'name'            => ChatService::displayName($user),
            'phone'           => $customer?->phone ?: $user?->phone,
            'email'           => $user?->email,
            'member_since'    => $user?->created_at?->format('F Y'),
            'loyalty_enabled' => $loyaltyOn,
            'loyalty'         => $loyalty ? [
                'tier'         => $loyalty->tier,
                'trust_score'  => (float) $loyalty->trust_score,
                'total_orders' => (int) $loyalty->total_orders,
                'total_spent'  => (float) $loyalty->total_spent,
            ] : null,
            'total_orders'    => (clone $counted)->count(),
            'total_spent'     => round((float) (clone $counted)->selectRaw('COALESCE(SUM(total_amount + COALESCE(shipping_fee, 0)), 0) AS s')->value('s'), 2),
            'open_balance'    => round((float) (clone $counted)->where('payment_mode', 'consignment')->where('remaining_balance', '>', 0)->sum('remaining_balance'), 2),
            'recent_orders'   => (clone $orders)->latest()->limit(5)->get()->map(fn (Order $o) => [
                'id'                => $o->id,
                'order_number'      => $o->order_number,
                'status'            => $o->status,
                'total'             => $o->grandTotal(),
                'payment_mode'      => $o->payment_mode,
                'remaining_balance' => (float) $o->remaining_balance,
                'ordered_at'        => $o->created_at?->toIso8601String(),
                'url'               => "/seller/orders/{$o->id}",
            ]),
        ]]);
    }

    // ── Quick replies ─────────────────────────────────────────────────────────

    public function quickReplies(Request $request): JsonResponse
    {
        return response()->json(['quickReplies' => StoreQuickReply::where('store_id', $this->storeId($request))->orderBy('title')->get(['id', 'title', 'body'])]);
    }

    public function storeQuickReply(Request $request): JsonResponse
    {
        abort_unless($this->canReply($request), 403);
        $reply = StoreQuickReply::create($this->validateReply($request) + ['store_id' => $this->storeId($request)]);

        return response()->json(['quickReply' => $reply->only('id', 'title', 'body')], 201);
    }

    public function updateQuickReply(Request $request, StoreQuickReply $quickReply): JsonResponse
    {
        abort_unless($this->canReply($request) && $quickReply->store_id === $this->storeId($request), 403);
        $quickReply->update($this->validateReply($request));

        return response()->json(['quickReply' => $quickReply->only('id', 'title', 'body')]);
    }

    public function destroyQuickReply(Request $request, StoreQuickReply $quickReply): JsonResponse
    {
        abort_unless($this->canReply($request) && $quickReply->store_id === $this->storeId($request), 403);
        $quickReply->delete();

        return response()->json(['ok' => true]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function storeId(Request $request): int
    {
        $storeId = ChatService::storeIdFor($request->user());
        abort_unless($storeId && ChatService::hasStoreAccess($request->user(), $storeId), 403);

        return $storeId;
    }

    private function canReply(Request $request): bool
    {
        $u = $request->user();

        return $u->role === 'seller' || $u->hasPermission('messages.reply');
    }

    private function validateReply(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:60'],
            'body'  => ['required', 'string', 'max:1000'],
        ]);
    }
}
