<?php

namespace App\Http\Controllers\Chat;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\ConversationMessage;
use App\Models\Order;
use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Shared chat actions for the customer, seller and rider portals. Every action checks access
 * through ChatService (403 otherwise), and riders only ever get messages inside their window.
 */
abstract class BaseMessageController extends Controller
{
    /** 'customer' | 'seller' | 'rider' */
    abstract protected function portal(): string;

    /** Inertia page, e.g. 'customer/messages'. */
    abstract protected function page(): string;

    /** Extra props for the page (e.g. quick replies on the seller side). */
    protected function pageExtras(Request $request): array
    {
        return [];
    }

    /** The side a user must be on to use a conversation from this portal. */
    protected function side(): string
    {
        return $this->portal() === 'seller' ? 'store' : $this->portal();
    }

    public function index(Request $request): Response
    {
        $user = $request->user();
        $list = ChatService::withUnreadCount(ChatService::conversationsFor($user, $this->portal()), $user, $this->portal())
            ->with([
                'store:id,store_name,logo',
                'customer:id,name,first_name,last_name',
                'rider:id,name,first_name,last_name',
                'activeRiderAccess.rider:id,name,first_name,last_name,phone',
                'activeRiderAccess.delivery:id,order_id,status',
                'activeRiderAccess.delivery.order:id,order_number',
            ])
            ->paginate(30)->withQueryString()
            ->through(fn (Conversation $c) => ChatService::formatListItem($c, $this->portal(), $user));

        return Inertia::render($this->page(), [
            'conversations' => $list,
            'openId'        => $request->integer('c') ?: null,
            ...$this->pageExtras($request),
        ]);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeView($request, $conversation);

        $msgs = $this->messageQuery($request, $conversation)->orderByDesc('id')->limit(51)->get();
        $hasMore = $msgs->count() > 50;
        ChatService::markRead($conversation, $request->user());

        return response()->json([
            'conversation' => $this->header($request, $conversation),
            'messages'     => $msgs->take(50)->reverse()->values()->map(fn ($m) => $this->format($m, $conversation)),
            'has_more'     => $hasMore,
        ]);
    }

    /** Polling (?after=id → newer) and "load earlier" (?before=id → 30 older). */
    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeView($request, $conversation);

        if ($before = $request->integer('before')) {
            $msgs = $this->messageQuery($request, $conversation)->where('id', '<', $before)->orderByDesc('id')->limit(31)->get();

            return response()->json([
                'messages' => $msgs->take(30)->reverse()->values()->map(fn ($m) => $this->format($m, $conversation)),
                'has_more' => $msgs->count() > 30,
            ]);
        }

        $msgs = $this->messageQuery($request, $conversation)->where('id', '>', $request->integer('after'))->orderBy('id')->limit(100)->get();
        if ($msgs->isNotEmpty() || $request->boolean('read')) {
            ChatService::markRead($conversation, $request->user());
        }
        $conversation->refresh();

        return response()->json([
            'messages'     => $msgs->map(fn ($m) => $this->format($m, $conversation)),
            // Lets the open thread notice a rider joining/leaving or the chat closing without a reload
            'conversation' => $this->header($request, $conversation),
        ]);
    }

    public function store(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeView($request, $conversation);
        $data = $request->validate([
            'body'     => ['nullable', 'string', 'max:2000', 'required_without:image'],
            'image'    => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'required_without:body'],
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
        ], [
            'body.required_without'  => 'Type a message or add a photo.',
            'image.required_without' => 'Type a message or add a photo.',
        ]);

        // An order tag must be an order of this conversation's store (and customer)
        if (! empty($data['order_id'])) {
            $ok = Order::whereKey($data['order_id'])->where('store_id', $conversation->store_id)
                ->when($conversation->customer_id, fn ($q) => $q->whereHas('customer', fn ($c) => $c->where('user_id', $conversation->customer_id)))
                ->exists();
            abort_unless($ok, 422, 'That order does not belong to this conversation.');
        }

        $message = ChatService::send($conversation, $request->user(), $data['body'] ?? null, $request->file('image'), $data['order_id'] ?? null);

        return response()->json(['message' => $this->format($message, $conversation)], 201);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['count' => ChatService::unreadCountFor($request->user())]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    protected function authorizeView(Request $request, Conversation $conversation): void
    {
        abort_unless(ChatService::sideFor($conversation, $request->user()) === $this->side(), 403);
    }

    /** Messages this user may see (riders: only their window), with what the bubbles need. */
    protected function messageQuery(Request $request, Conversation $conversation)
    {
        return ChatService::visibleMessages(
            $conversation->messages()->getQuery()->with(['sender:id,name,first_name,last_name', 'order:id,order_number']),
            $conversation, $request->user(),
        );
    }

    protected function openChat(Conversation $conversation)
    {
        return redirect("/{$this->portal()}/messages?c={$conversation->id}");
    }

    protected function format(ConversationMessage $m, Conversation $c): array
    {
        return ChatService::formatMessage($m->loadMissing(['sender:id,name,first_name,last_name', 'order:id,order_number']), $c->store?->store_name);
    }

    protected function header(Request $request, Conversation $c): array
    {
        $user = $request->user();
        $c->loadMissing(['store', 'customer', 'rider']);
        $c->load(['activeRiderAccess.rider', 'activeRiderAccess.delivery.order']);
        $item   = ChatService::formatListItem($c, $this->portal(), $user);
        $reason = ChatService::cannotSendReason($c, $user);
        $riders = $c->type === Conversation::CUSTOMER_STORE ? ChatService::riderStrip($c) : [];

        // Rider viewing a customer chat: their own delivery (call the customer, navigate there)
        $myDelivery = null;
        if ($this->portal() === 'rider' && $c->type === Conversation::CUSTOMER_STORE) {
            $access = $c->activeRiderAccess->firstWhere('rider_id', $user->id);
            $order  = $access?->delivery?->order;
            $myDelivery = $order ? [
                'order_id'     => $order->id,
                'order_number' => $order->order_number,
                'status'       => $access->delivery->status,
                'status_label' => ChatService::DELIVERY_LABELS[$access->delivery->status] ?? '',
                'navigate_url' => $order->delivery_latitude && $order->delivery_longitude
                    ? "https://www.google.com/maps/dir/?api=1&destination={$order->delivery_latitude},{$order->delivery_longitude}"
                    : null,
            ] : null;
        }

        $phone = match (true) {
            $c->type === Conversation::STORE_RIDER    => $this->portal() === 'seller' ? $c->rider?->phone : null,
            $this->portal() === 'customer'            => null,   // the store; riders have their own call button
            default                                   => $c->customer?->phone,   // seller or rider → the customer
        };

        return [
            'id'                 => $c->id,
            'type'               => $c->type,
            'title'              => $item['title'],
            'subtitle'           => $item['subtitle'],
            'initials'           => $item['initials'],
            'avatar_url'         => $item['avatar_url'],
            'store_name'         => $c->store?->store_name,
            'is_closed'          => $c->isClosed(),
            'can_send'           => $reason === null,
            'cannot_send_reason' => $reason,
            'phone'              => $phone,
            // customer & seller views: rider(s) currently in this chat
            'riders'             => $this->portal() === 'rider' ? [] : $riders,
            // rider view: the delivery they're on
            'my_delivery'        => $myDelivery,
        ];
    }
}
