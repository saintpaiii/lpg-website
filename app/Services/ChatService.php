<?php

namespace App\Services;

use App\Events\MessageSent;
use App\Events\UnreadCountChanged;
use App\Models\Conversation;
use App\Models\ConversationMessage;
use App\Models\ConversationRead;
use App\Models\ConversationRiderAccess;
use App\Models\Delivery;
use App\Models\Notification;
use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use App\Support\Realtime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Single source of truth for chat.
 *
 * Conversations:
 *  - customer_store: ONE per customer + store. While a delivery is active its rider JOINS this chat
 *    (conversation_rider_access) and only sees messages inside their window — never the
 *    customer's older history with the store.
 *  - store_rider: private dispatch chat between a store and one of its riders.
 *  - customer_rider: retired (merged by `chat:merge-rider-chats`); never created any more.
 *
 * Sides: 'customer', 'store' (owner + staff with messages.view; replying needs messages.reply),
 * 'rider', and 'system' for neutral notices ("… joined the chat").
 */
class ChatService
{
    public const DELIVERY_LABELS = [
        'assigned'   => 'Assigned',
        'picked_up'  => 'Picked up',
        'in_transit' => 'On the way',
        'delivered'  => 'Delivered',
        'failed'     => 'Failed',
    ];

    // ── Conversations ────────────────────────────────────────────────────────

    public static function customerStoreConversation(int $customerId, int $storeId): Conversation
    {
        return static::getOrCreate(['type' => Conversation::CUSTOMER_STORE, 'store_id' => $storeId, 'customer_id' => $customerId, 'rider_id' => null, 'delivery_id' => null]);
    }

    public static function storeRiderConversation(int $storeId, int $riderId): Conversation
    {
        return static::getOrCreate(['type' => Conversation::STORE_RIDER, 'store_id' => $storeId, 'customer_id' => null, 'rider_id' => $riderId, 'delivery_id' => null]);
    }

    /** The customer↔store chat for an order (null for walk-in customers without an account). */
    public static function conversationForOrder(?Order $order): ?Conversation
    {
        $userId = $order?->customer?->user_id;   // orders.customer_id is the customers table

        return $userId && $order->store_id ? static::customerStoreConversation($userId, $order->store_id) : null;
    }

    /** NULL-safe get-or-create under a row lock (MySQL unique indexes treat NULLs as distinct). */
    private static function getOrCreate(array $keys): Conversation
    {
        return DB::transaction(function () use ($keys) {
            $q = Conversation::query();
            foreach ($keys as $col => $val) {
                $val === null ? $q->whereNull($col) : $q->where($col, $val);
            }

            return $q->lockForUpdate()->first() ?? Conversation::create($keys);
        });
    }

    private static function maxMessageId(int $conversationId): int
    {
        return (int) ConversationMessage::where('conversation_id', $conversationId)->max('id');
    }

    // ── Rider joins / leaves the customer's chat ─────────────────────────────

    /** The delivery's rider joins the customer↔store chat; they see messages from here on. */
    public static function riderJoin(Delivery $delivery, bool $announce = true): ?ConversationRiderAccess
    {
        $delivery->loadMissing(['order.customer', 'rider']);
        $chat = static::conversationForOrder($delivery->order);
        if (! $chat || ! $delivery->rider_id) {
            return null;
        }

        $access = ConversationRiderAccess::firstOrNew([
            'conversation_id' => $chat->id, 'delivery_id' => $delivery->id, 'rider_id' => $delivery->rider_id,
        ]);
        if ($access->exists && $access->isActive()) {
            return $access;
        }
        $access->fill(['from_message_id' => static::maxMessageId($chat->id), 'to_message_id' => null, 'ended_at' => null])->save();

        if ($announce) {
            static::system($chat, static::displayName($delivery->rider) . " (Rider) joined the chat for order {$delivery->order->order_number}.", $delivery->order_id);
        }

        return $access;
    }

    /** End a rider's access for this delivery ("left the chat" unless they're still in for another delivery). */
    public static function riderLeave(Delivery $delivery, int $riderId, bool $announce = true): void
    {
        $delivery->loadMissing('order.customer');
        $chat = static::conversationForOrder($delivery->order);
        if (! $chat) {
            return;
        }
        $access = ConversationRiderAccess::where('conversation_id', $chat->id)->where('delivery_id', $delivery->id)
            ->where('rider_id', $riderId)->whereNull('ended_at')->first();
        if (! $access) {
            return;
        }

        $stillIn = ConversationRiderAccess::where('conversation_id', $chat->id)->where('rider_id', $riderId)
            ->whereNull('ended_at')->whereKeyNot($access->id)->exists();
        if ($announce && ! $stillIn) {
            static::system($chat, static::firstName(User::withTrashed()->find($riderId)) . ' (Rider) left the chat.', $delivery->order_id);
        }
        $access->update(['ended_at' => now(), 'to_message_id' => static::maxMessageId($chat->id)]);

        // The chat leaves the rider's inbox — refresh their badge
        static::broadcastUnread([$riderId]);
    }

    /** @return Collection<int, ConversationRiderAccess> */
    public static function activeRiderAccess(Conversation $c, ?User $rider = null): Collection
    {
        return ConversationRiderAccess::where('conversation_id', $c->id)->whereNull('ended_at')
            ->when($rider, fn ($q) => $q->where('rider_id', $rider->id))->get();
    }

    // ── Access ────────────────────────────────────────────────────────────────

    /** The store a user acts for in the seller portal (owner's store, or staff's store; riders excluded). */
    public static function storeIdFor(User $user): ?int
    {
        if ($user->role === 'seller') {
            return Store::where('user_id', $user->id)->value('id');
        }
        if ($user->role === 'seller_staff' && $user->sub_role !== 'rider') {
            return $user->store_id;
        }

        return null;
    }

    public static function hasStoreAccess(User $user, ?int $storeId = null): bool
    {
        $own = static::storeIdFor($user);
        $storeId ??= $own;
        if (! $storeId || $own !== $storeId) {
            return false;
        }

        return $user->role === 'seller' || $user->hasPermission('messages.view');
    }

    public static function sideFor(Conversation $c, User $user): ?string
    {
        if ($c->type === Conversation::CUSTOMER_STORE) {
            if ($c->customer_id && $user->id === $c->customer_id) {
                return 'customer';
            }
            if (static::hasStoreAccess($user, $c->store_id)) {
                return 'store';
            }
            if (ConversationRiderAccess::where('conversation_id', $c->id)->where('rider_id', $user->id)->exists()) {
                return 'rider';
            }

            return null;
        }
        if ($c->type === Conversation::STORE_RIDER) {
            if ($c->rider_id && $user->id === $c->rider_id) {
                return 'rider';
            }

            return static::hasStoreAccess($user, $c->store_id) ? 'store' : null;
        }

        return null;   // customer_rider is retired
    }

    public static function canView(Conversation $c, User $user): bool
    {
        return static::sideFor($c, $user) !== null;
    }

    /** Why the user can't send right now (null = they can). */
    public static function cannotSendReason(Conversation $c, User $user): ?string
    {
        $side = static::sideFor($c, $user);

        return match (true) {
            $side === null                                   => 'no_access',
            $c->isClosed()                                   => 'closed',
            $side === 'rider' && $c->type === Conversation::CUSTOMER_STORE
                && static::activeRiderAccess($c, $user)->isEmpty() => 'rider_ended',
            $side === 'store' && $user->role !== 'seller' && ! $user->hasPermission('messages.reply') => 'no_permission',
            $side === 'customer' && ! ($c->store?->canReceiveMessages() ?? false) => 'store_unavailable',
            default                                          => null,
        };
    }

    public static function canSend(Conversation $c, User $user): bool
    {
        return static::cannotSendReason($c, $user) === null;
    }

    /**
     * Restrict a messages query to what this user may see: riders on a customer chat only get
     * messages inside their access window(s); everyone else sees the whole conversation.
     */
    public static function visibleMessages(Builder $q, Conversation $c, User $user): Builder
    {
        if ($c->type !== Conversation::CUSTOMER_STORE || static::sideFor($c, $user) !== 'rider') {
            return $q;
        }
        $windows = ConversationRiderAccess::where('conversation_id', $c->id)->where('rider_id', $user->id)->get();

        return $q->where(function ($w) use ($windows) {
            foreach ($windows as $a) {
                $w->orWhere(fn ($x) => $x->where('id', '>', $a->from_message_id)
                    ->when($a->to_message_id !== null, fn ($y) => $y->where('id', '<=', $a->to_message_id)));
            }
            if ($windows->isEmpty()) {
                $w->whereRaw('1 = 0');
            }
        });
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    public static function send(Conversation $c, User $sender, ?string $body, ?UploadedFile $image = null, ?int $orderId = null): ConversationMessage
    {
        if ($reason = static::cannotSendReason($c, $sender)) {
            throw ValidationException::withMessages(['body' => match ($reason) {
                'closed'            => 'This chat is closed.',
                'rider_ended'       => 'Your delivery for this customer is complete.',
                'no_permission'     => "You don't have permission to reply.",
                'store_unavailable' => 'This store is currently unavailable.',
                default             => 'You cannot send messages here.',
            }]);
        }

        $body = $body !== null ? trim($body) : null;
        $path = $image?->store("chat_attachments/{$c->id}", 'public');

        $message = ConversationMessage::create([
            'conversation_id' => $c->id,
            'sender_id'       => $sender->id,
            'sender_side'     => static::sideFor($c, $sender),
            'body'            => $body !== '' ? $body : null,
            'attachment_path' => $path,
            'order_id'        => $orderId,
        ]);

        static::touch($c, $message);
        static::markRead($c, $sender, false);
        static::notifyRecipients($c, $sender, $message);
        static::afterNewMessage($c, $message, $sender->id);

        return $message;
    }

    /** Neutral notice (e.g. "… joined the chat"): centred, no sender, no notification. */
    public static function system(Conversation $c, string $body, ?int $orderId = null): ConversationMessage
    {
        $message = ConversationMessage::create([
            'conversation_id' => $c->id, 'sender_id' => null, 'sender_side' => 'system', 'body' => $body, 'order_id' => $orderId,
        ]);
        static::touch($c, $message);
        static::afterNewMessage($c, $message, null);

        return $message;
    }

    /**
     * Automatic update shown as a normal store / rider bubble ("Automatic update"). Never creates a
     * notification (the order flow sends its own). Skipped if this order already has this kind.
     */
    public static function automatic(Conversation $c, string $side, ?int $senderId, string $body, ?int $orderId, string $kind): ?ConversationMessage
    {
        if ($orderId && ConversationMessage::where('order_id', $orderId)->where('auto_kind', $kind)->exists()) {
            return null;
        }
        $message = ConversationMessage::create([
            'conversation_id' => $c->id,
            'sender_id'       => $senderId,
            'sender_side'     => $side,
            'is_automatic'    => true,
            'auto_kind'       => $kind,
            'body'            => $body,
            'order_id'        => $orderId,
        ]);
        static::touch($c, $message);
        static::afterNewMessage($c, $message, $senderId);

        return $message;
    }

    private static function touch(Conversation $c, ConversationMessage $m): void
    {
        $c->forceFill([
            'last_message_at'      => $m->created_at,
            'last_message_preview' => Str::limit($m->body ?: '📷 Photo', 110),
        ])->save();
    }

    /** Move the user's read marker to the newest message; tells their badge when it changed. */
    public static function markRead(Conversation $c, User $user, bool $broadcast = true): void
    {
        $maxId = static::maxMessageId($c->id);
        if ($maxId === 0) {
            return;
        }
        $prev = (int) ConversationRead::where('conversation_id', $c->id)->where('user_id', $user->id)->value('last_read_message_id');
        if ($prev >= $maxId) {
            return;
        }
        ConversationRead::upsert(
            [['conversation_id' => $c->id, 'user_id' => $user->id, 'last_read_message_id' => $maxId, 'created_at' => now(), 'updated_at' => now()]],
            ['conversation_id', 'user_id'],
            ['last_read_message_id', 'updated_at'],
        );
        if ($broadcast) {
            static::broadcastUnread([$user->id]);
        }
    }

    // ── Lists & unread ────────────────────────────────────────────────────────

    /** Conversations for a portal: 'customer', 'rider' or 'seller'. Most recent first. */
    public static function conversationsFor(User $user, string $portal): Builder
    {
        $q = Conversation::query();
        match ($portal) {
            'customer' => $q->where('customer_id', $user->id)->where('type', Conversation::CUSTOMER_STORE),
            'rider'    => $q->where(fn ($w) => $w
                ->where(fn ($s) => $s->where('type', Conversation::STORE_RIDER)->where('rider_id', $user->id))
                ->orWhere(fn ($s) => $s->where('type', Conversation::CUSTOMER_STORE)->whereExists(fn ($e) => $e
                    ->selectRaw('1')->from('conversation_rider_access as a')
                    ->whereColumn('a.conversation_id', 'conversations.id')
                    ->where('a.rider_id', $user->id)->whereNull('a.ended_at')))),
            'seller'   => static::hasStoreAccess($user)
                ? $q->where('store_id', static::storeIdFor($user))->whereIn('type', [Conversation::CUSTOMER_STORE, Conversation::STORE_RIDER])
                : $q->whereRaw('1 = 0'),
        };

        return $q->orderByRaw('last_message_at IS NULL, last_message_at DESC')->orderByDesc('id');
    }

    /**
     * Unread messages per conversation, as a subquery column for list queries (no N+1).
     * Unread = newer than the user's read marker and not from the viewer's own side.
     *  - store side: only real messages from customers/riders (not its own, not automatic or notices)
     *  - riders on a customer chat: only inside their active window
     */
    public static function withUnreadCount(Builder $q, User $user, string $portal): Builder
    {
        [$cond, $bindings] = match ($portal) {
            'seller'   => ["m.sender_side NOT IN ('store','system') AND m.is_automatic = 0", []],
            'customer' => ['(m.sender_id IS NULL OR m.sender_id <> ?)', [$user->id]],
            'rider'    => ["(m.sender_id IS NULL OR m.sender_id <> ?) AND (conversations.type <> 'customer_store' OR EXISTS (
                              SELECT 1 FROM conversation_rider_access a WHERE a.conversation_id = conversations.id
                                AND a.rider_id = ? AND a.ended_at IS NULL AND m.id > a.from_message_id))", [$user->id, $user->id]],
        };

        return $q->select('conversations.*')->selectRaw(
            "(SELECT COUNT(*) FROM conversation_messages m
                LEFT JOIN conversation_reads r ON r.conversation_id = m.conversation_id AND r.user_id = ?
              WHERE m.conversation_id = conversations.id
                AND m.id > COALESCE(r.last_read_message_id, 0)
                AND {$cond}) AS unread_count",
            [$user->id, ...$bindings],
        );
    }

    /** Total unread across every chat the user can see (one query). */
    public static function unreadCountFor(User $user): int
    {
        $storeId = static::hasStoreAccess($user) ? static::storeIdFor($user) : null;
        $u = $user->id;

        $sql = "SELECT COUNT(*) AS n FROM conversation_messages m
                JOIN conversations c ON c.id = m.conversation_id
                LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
                WHERE m.id > COALESCE(r.last_read_message_id, 0) AND (
                    (c.type = 'customer_store' AND c.customer_id = ? AND (m.sender_id IS NULL OR m.sender_id <> ?))
                 OR (c.type = 'store_rider' AND c.rider_id = ? AND (m.sender_id IS NULL OR m.sender_id <> ?))
                 OR (c.type = 'customer_store' AND (m.sender_id IS NULL OR m.sender_id <> ?) AND EXISTS (
                        SELECT 1 FROM conversation_rider_access a WHERE a.conversation_id = c.id
                          AND a.rider_id = ? AND a.ended_at IS NULL AND m.id > a.from_message_id))"
              . ($storeId ? " OR (c.store_id = ? AND c.type IN ('customer_store','store_rider') AND m.sender_side NOT IN ('store','system') AND m.is_automatic = 0)" : '')
              . ')';
        $bindings = [$u, $u, $u, $u, $u, $u, $u];
        if ($storeId) {
            $bindings[] = $storeId;
        }

        return (int) (DB::selectOne($sql, $bindings)->n ?? 0);
    }

    // ── Presentation ──────────────────────────────────────────────────────────

    public static function displayName(?User $user): string
    {
        if (! $user) {
            return 'Deleted user';
        }

        return trim($user->name ?: trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? ''))) ?: 'User';
    }

    public static function firstName(?User $user): string
    {
        return $user ? ($user->first_name ?: Str::before(static::displayName($user), ' ')) : '';
    }

    /**
     * One message, the same for every viewer (JSON endpoints and live events). The page works out
     * "is this mine" and the order link for its portal.
     */
    public static function formatMessage(ConversationMessage $m, ?string $storeName = null): array
    {
        $senderName = match ($m->sender_side) {
            'store'  => ($storeName ?? 'Store') . ($m->sender && ! $m->is_automatic ? ' · ' . static::firstName($m->sender) : ''),
            'rider'  => static::displayName($m->sender) . ' · Rider',
            'system' => null,
            default  => static::displayName($m->sender),
        };

        return [
            'id'              => $m->id,
            'conversation_id' => $m->conversation_id,
            'side'            => $m->sender_side,
            'sender_id'       => $m->sender_id,
            'is_automatic'    => (bool) $m->is_automatic,
            'sender_name'     => $senderName,
            'body'            => $m->body,
            'attachment_url'  => $m->attachment_url,
            'order'           => $m->order_id ? ['id' => $m->order_id, 'order_number' => $m->order?->order_number] : null,
            'created_at'      => $m->created_at?->toIso8601String(),
        ];
    }

    /** Active rider(s) in a customer chat, for the header strip / list subtitle. */
    public static function riderStrip(Conversation $c): array
    {
        $rows = $c->relationLoaded('activeRiderAccess') ? $c->activeRiderAccess : $c->activeRiderAccess()->with(['rider', 'delivery.order'])->get();

        return $rows->map(fn (ConversationRiderAccess $a) => [
            'rider_id'     => $a->rider_id,
            'name'         => static::displayName($a->rider),
            'phone'        => $a->rider?->phone,
            'status'       => $a->delivery?->status,
            'status_label' => static::DELIVERY_LABELS[$a->delivery?->status] ?? '',
            'order_id'     => $a->delivery?->order_id,
            'order_number' => $a->delivery?->order?->order_number,
        ])->values()->all();
    }

    /** List row for a conversation, from the viewer's point of view. */
    public static function formatListItem(Conversation $c, string $portal, ?User $viewer = null): array
    {
        $riders = $c->type === Conversation::CUSTOMER_STORE ? static::riderStrip($c) : [];
        $first  = $riders[0] ?? null;
        $mine   = $portal === 'rider' && $viewer ? collect($riders)->firstWhere('rider_id', $viewer->id) : null;

        [$title, $subtitle] = match (true) {
            $portal === 'customer' => [$c->store?->store_name ?? 'Store', $first ? "Rider: {$first['name']} · {$first['status_label']}" : 'Store'],
            $portal === 'seller' && $c->type === Conversation::STORE_RIDER => [static::displayName($c->rider), 'Rider'],
            $portal === 'seller'   => [static::displayName($c->customer), $first ? "Customer · Rider {$first['name']}: {$first['status_label']}" : 'Customer'],
            $portal === 'rider' && $c->type === Conversation::STORE_RIDER => [$c->store?->store_name ?? 'Store', 'Your store'],
            $portal === 'rider'    => [static::displayName($c->customer), 'Order ' . ($mine['order_number'] ?? '') . ' · ' . ($mine['status_label'] ?? '')],
            default                => ['Conversation', ''],
        };

        return [
            'id'                   => $c->id,
            'type'                 => $c->type,
            'title'                => $title,
            'subtitle'             => $subtitle,
            'rider_active'         => $portal !== 'rider' && $first !== null,
            'initials'             => collect(preg_split('/\s+/', trim($title)))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->implode('') ?: '?',
            'avatar_url'           => $portal === 'customer' && $c->store?->logo ? \Illuminate\Support\Facades\Storage::disk('public')->url($c->store->logo) : null,
            'last_message_preview' => $c->last_message_preview,
            'last_message_at'      => $c->last_message_at?->toIso8601String(),
            'unread_count'         => (int) ($c->unread_count ?? 0),
            'is_closed'            => $c->isClosed(),
        ];
    }

    // ── Recipients, notifications, live updates ──────────────────────────────

    /** Users on the store side who should hear about new messages (owner + staff with messages.view). */
    public static function storeRecipients(int $storeId): array
    {
        $ownerId = Store::whereKey($storeId)->value('user_id');
        $staff   = User::where('store_id', $storeId)->where('role', 'seller_staff')
            ->where(fn ($q) => $q->whereNull('sub_role')->orWhere('sub_role', '!=', 'rider'))
            ->where('is_active', true)->get()
            ->filter(fn (User $u) => $u->hasPermission('messages.view'))
            ->pluck('id')->all();

        return array_values(array_unique(array_filter([$ownerId, ...$staff])));
    }

    /** Everyone currently in a conversation: user id => portal. */
    public static function participants(Conversation $c): array
    {
        $p = [];
        foreach (static::storeRecipients($c->store_id) as $id) {
            $p[$id] = 'seller';
        }
        if ($c->type === Conversation::CUSTOMER_STORE) {
            if ($c->customer_id) {
                $p[$c->customer_id] = 'customer';
            }
            foreach (static::activeRiderAccess($c)->pluck('rider_id') as $id) {
                $p[$id] = 'rider';
            }
        } elseif ($c->type === Conversation::STORE_RIDER && $c->rider_id) {
            $p[$c->rider_id] = 'rider';
        }

        return $p;
    }

    /**
     * Who gets a "new message" notification:
     *  customer chat — rider sends → customer + store; customer sends → store + active riders;
     *                  store sends → customer only
     *  store↔rider   — the other side
     */
    private static function notifyRecipients(Conversation $c, User $sender, ConversationMessage $m): void
    {
        try {
            $all = static::participants($c);
            $side = $m->sender_side;
            $targets = array_filter($all, fn ($portal) => match ($c->type) {
                Conversation::CUSTOMER_STORE => match ($side) {
                    'rider'    => in_array($portal, ['customer', 'seller'], true),
                    'customer' => in_array($portal, ['seller', 'rider'], true),
                    'store'    => $portal === 'customer',
                    default    => false,
                },
                Conversation::STORE_RIDER => $side === 'rider' ? $portal === 'seller' : $portal === 'rider',
                default => false,
            });
            unset($targets[$sender->id]);

            $from = match ($side) {
                'store' => $c->store?->store_name ?? 'Store',
                'rider' => static::displayName($sender) . ' (Rider)',
                default => static::displayName($sender),
            };
            $preview = Str::limit($m->body ?: '📷 Photo', 80);

            foreach ($targets as $userId => $portal) {
                // Skip if they already have an unread new-message notice for this chat from the last 10 minutes
                $recent = Notification::where('user_id', $userId)->where('type', 'new_message')->whereNull('read_at')
                    ->where('created_at', '>=', now()->subMinutes(10))
                    ->where('data->conversation_id', $c->id)->exists();
                if (! $recent) {
                    NotificationService::send($userId, 'new_message', "New message from {$from}", $preview, [
                        'conversation_id' => $c->id,
                        'link'            => "/{$portal}/messages?c={$c->id}",
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Chat notification failed', ['conversation_id' => $c->id, 'error' => $e->getMessage()]);
        }
    }

    /** Push the message live and refresh the other participants' unread badges. */
    private static function afterNewMessage(Conversation $c, ConversationMessage $m, ?int $senderId): void
    {
        if (! Realtime::enabled()) {
            return;
        }
        try {
            $m->loadMissing(['sender:id,name,first_name,last_name', 'order:id,order_number']);
            $payload  = static::formatMessage($m, $c->store?->store_name);
            $channels = ["conversation.{$c->id}"];
            $participants = static::participants($c);
            // Riders in a customer chat get it on their own channel (their access is time-boxed)
            foreach ($participants as $id => $portal) {
                if ($portal === 'rider' && $c->type === Conversation::CUSTOMER_STORE) {
                    $channels[] = "user.{$id}";
                }
            }
            Realtime::send(new MessageSent($payload, $channels));
            static::broadcastUnread(array_diff(array_keys($participants), [$senderId]));
        } catch (\Throwable $e) {
            Log::warning('Chat live update failed', ['conversation_id' => $c->id, 'error' => $e->getMessage()]);
        }
    }

    /** @param array<int, int> $userIds */
    public static function broadcastUnread(array $userIds): void
    {
        if (! Realtime::enabled()) {
            return;
        }
        foreach (array_unique(array_filter($userIds)) as $id) {
            if ($user = User::find($id)) {
                Realtime::send(new UnreadCountChanged(['count' => static::unreadCountFor($user)], ["user.{$id}"]));
            }
        }
    }
}
