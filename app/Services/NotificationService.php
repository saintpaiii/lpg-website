<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Store;
use App\Models\User;
use Illuminate\Pagination\LengthAwarePaginator;

class NotificationService
{
    /** Send a notification to a single user. */
    public static function send(int $userId, string $type, string $title, string $message, array $data = []): void
    {
        $n = Notification::create([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'message' => $message,
            'data'    => $data ?: null,
        ]);

        // Live bell update (same shape as the shared recentNotifications prop); never throws
        \App\Support\Realtime::send(new \App\Events\NotificationCreated([
            'id'         => $n->id,
            'type'       => $n->type,
            'title'      => $n->title,
            'message'    => $n->message,
            'data'       => $n->data,
            'created_at' => $n->created_at?->diffForHumans(),
        ], ["user.{$userId}"]));
    }

    /** Send to multiple users. */
    public static function sendToMany(array $userIds, string $type, string $title, string $message, array $data = []): void
    {
        foreach (array_unique(array_filter($userIds)) as $userId) {
            static::send((int) $userId, $type, $title, $message, $data);
        }
    }

    /** Send to all users with a specific role. */
    public static function sendToRole(string $role, string $type, string $title, string $message, array $data = []): void
    {
        $userIds = User::where('role', $role)->whereNull('deleted_at')->pluck('id')->toArray();
        static::sendToMany($userIds, $type, $title, $message, $data);
    }

    /** Send to the store owner and all active staff of a store. */
    public static function sendToStore(int $storeId, string $type, string $title, string $message, array $data = []): void
    {
        $ownerIds = Store::where('id', $storeId)->pluck('user_id');
        $staffIds = User::where('store_id', $storeId)
            ->where('role', 'seller_staff')
            ->whereNull('deleted_at')
            ->pluck('id');

        $userIds = $ownerIds->merge($staffIds)->unique()->toArray();
        static::sendToMany($userIds, $type, $title, $message, static::withStoreLink($storeId, $data));
    }

    /**
     * J9: "the store owner" of a store's event — the owner AND, for a branch, its Branch Manager. The link opens that
     * store for the owner (?store=ID, EnsureIsSeller switches) when the owner has more than one store.
     */
    public static function sendToStoreOwner(Store|int $store, string $type, string $title, string $message, array $data = []): void
    {
        $store = $store instanceof Store ? $store : Store::withTrashed()->find($store);
        if (! $store) {
            return;
        }
        $ids = [(int) $store->user_id];
        if ($store->isBranch()) {
            $bm = \App\Models\StoreRole::where('store_id', $store->id)->where('starter_key', 'branch_manager')->value('id');
            if ($bm) {
                $ids = array_merge($ids, User::join('store_role_user', 'store_role_user.user_id', '=', 'users.id')
                    ->where('store_role_user.store_role_id', $bm)->where('users.is_active', true)->whereNull('users.deleted_at')
                    ->pluck('users.id')->map(fn ($v) => (int) $v)->all());
            }
        }
        static::sendToMany($ids, $type, $title, $message, static::withStoreLink($store->id, $data));
    }

    /** J9: add "store=ID" to a /seller link of a store whose owner has several stores (no change otherwise). */
    private static function withStoreLink(int $storeId, array $data): array
    {
        $link = $data['link'] ?? null;
        if (! is_string($link) || ! str_starts_with($link, '/seller') || str_contains($link, 'store=')) {
            return $data;
        }
        $store = Store::withTrashed()->select(['id', 'user_id', 'parent_store_id'])->find($storeId);
        if (! $store || (! $store->parent_store_id && ! Store::where('parent_store_id', $store->id)->exists())) {
            return $data;
        }
        $data['link'] = $link . (str_contains($link, '?') ? '&' : '?') . "store={$storeId}";

        return $data;
    }

    /** Mark a single notification as read (only if it belongs to the user). */
    public static function markAsRead(int $notificationId, int $userId): void
    {
        Notification::where('id', $notificationId)
            ->where('user_id', $userId)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    /** Mark all notifications as read for a user. */
    public static function markAllAsRead(int $userId): void
    {
        Notification::where('user_id', $userId)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
    }

    /** Get count of unread notifications for a user. */
    public static function getUnreadCount(int $userId): int
    {
        return Notification::where('user_id', $userId)
            ->whereNull('read_at')
            ->count();
    }

    /** Get paginated notifications for a user (newest first). */
    public static function getForUser(int $userId, int $perPage = 20): LengthAwarePaginator
    {
        return Notification::where('user_id', $userId)
            ->latest()
            ->paginate($perPage);
    }
}
