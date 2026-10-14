<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\NotificationService;
use App\Services\StoreDocumentService;
use App\Support\StoreDocuments;
use Illuminate\Console\Command;

/**
 * Daily: remind owners 30 / 7 / 1 days before a permit expires, tell them (and admins) when it expired,
 * and hide stores whose permit has been expired for more than 7 days (shown again once renewed).
 */
class CheckStoreDocuments extends Command
{
    protected $signature   = 'stores:check-documents';
    protected $description = 'Send permit expiry reminders and hide stores with permits expired for more than 7 days.';

    public function handle(): int
    {
        $reminders = $expired = $changed = 0;

        foreach (Store::where('status', 'approved')->get() as $store) {
            foreach (StoreDocuments::expiringTypes() as $type) {
                $days = StoreDocuments::daysLeft($store, $type);
                if ($days === null) {
                    continue;   // no date on file: no reminders, never hidden
                }
                $label = StoreDocuments::label($type);
                $date  = StoreDocuments::expiry($store, $type)->format('M d, Y');

                if (in_array($days, StoreDocuments::REMIND_DAYS, true)) {
                    NotificationService::send($store->user_id, 'system', "{$label} expires soon",
                        "{$label} expires on {$date} ({$days} " . ($days === 1 ? 'day' : 'days') . '). Upload the renewed permit in Store Documents.',
                        ['link' => '/seller/documents']);
                    $reminders++;
                } elseif ($days === -1) {   // expired yesterday
                    $msg = "{$label} expired. Your store will be hidden from customers in " . StoreDocuments::GRACE_DAYS . ' days unless the renewed permit is approved.';
                    NotificationService::send($store->user_id, 'system', "{$label} expired", $msg, ['link' => '/seller/documents']);
                    StoreDocumentService::notifyAdmins("{$store->store_name}: {$label} expired", $msg, ['link' => "/admin/stores/{$store->id}", 'store_id' => $store->id]);
                    $expired++;
                }
            }

            if (StoreDocumentService::checkStore($store)) {
                $changed++;
            }
        }

        $this->info("Sent {$reminders} reminder(s), {$expired} expiry notice(s); {$changed} store(s) hidden or shown again.");

        return self::SUCCESS;
    }
}
