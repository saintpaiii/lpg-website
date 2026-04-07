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
        Notification::create([
            'user_id' => $userId,
            'type'    => $type,
            'title'   => $title,
            'message' => $message,
            'data'    => $data ?: null,
        ]);
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
        static::sendToMany($userIds, $type, $title, $message, $data);
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
