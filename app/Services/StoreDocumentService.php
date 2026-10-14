<?php

namespace App\Services;

use App\Models\Store;
use App\Support\StoreDocuments;

/**
 * Hides a store from customers while a permit has been expired for more than StoreDocuments::GRACE_DAYS,
 * and shows it again as soon as nothing is expired beyond the grace period (e.g. a renewal was approved).
 * Never touches stores.status, so the owner can still log in and upload the renewal.
 */
class StoreDocumentService
{
    /** @return bool true when the store's hidden state changed */
    public static function checkStore(Store $store): bool
    {
        $overdue = null;   // the permit that expired the longest ago, beyond the grace period
        foreach (StoreDocuments::expiringTypes() as $type) {
            $days = StoreDocuments::daysLeft($store, $type);
            if ($days !== null && $days < -StoreDocuments::GRACE_DAYS && ($overdue === null || $days < $overdue['days'])) {
                $overdue = ['type' => $type, 'days' => $days];
            }
        }

        if ($overdue && ! $store->documents_suspended) {
            $store->forceFill(['documents_suspended' => true, 'documents_suspended_at' => now()])->save();
            $label = StoreDocuments::label($overdue['type']);
            $date  = StoreDocuments::expiry($store, $overdue['type'])->format('M d, Y');
            NotificationService::send($store->user_id, 'system', 'Store hidden from customers',
                "Your store is hidden from customers because your {$label} expired on {$date}. Upload the renewed document in Store Documents.",
                ['link' => '/seller/documents']);
            static::notifyAdmins('Store hidden: expired permit',
                "{$store->store_name} is hidden from customers because its {$label} expired on {$date}.",
                ['link' => "/admin/stores/{$store->id}", 'store_id' => $store->id]);

            return true;
        }

        if (! $overdue && $store->documents_suspended) {
            $store->forceFill(['documents_suspended' => false, 'documents_suspended_at' => null])->save();
            NotificationService::send($store->user_id, 'system', 'Store visible again',
                'Your store is visible to customers again.', ['link' => '/seller/documents']);

            return true;
        }

        return false;
    }

    public static function notifyAdmins(string $title, string $message, array $data = []): void
    {
        NotificationService::sendToRole('platform_admin', 'system', $title, $message, $data);
        NotificationService::sendToRole('admin', 'system', $title, $message, $data);
    }
}
