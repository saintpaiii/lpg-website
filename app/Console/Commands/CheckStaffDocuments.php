<?php

namespace App\Console\Commands;

use App\Models\StaffDocument;
use App\Services\NotificationService;
use App\Services\StaffDocumentService;
use Illuminate\Console\Command;

/**
 * Daily: driver's license reminders for riders (30 / 7 / 1 days before expiry) and an "expired" notice the day after.
 * Only each rider's LATEST approved license counts, so an old license that was replaced sends nothing.
 * The rider and the store owner are both told.
 */
class CheckStaffDocuments extends Command
{
    protected $signature   = 'staff:check-documents';
    protected $description = "Remind riders and store owners about driver's licenses that expire soon or just expired.";

    private const REMIND_DAYS = [30, 7, 1];

    public function handle(): int
    {
        $today = StaffDocumentService::today();
        $sent  = 0;

        $latest = StaffDocument::with(['user', 'store'])
            ->where('doc_type', 'drivers_license')->where('status', 'approved')->whereNotNull('expires_at')
            ->get()
            ->groupBy('user_id')
            ->map(fn ($docs) => $docs->sortByDesc(fn ($d) => $d->expires_at->timestamp)->first());

        foreach ($latest as $doc) {
            $rider = $doc->user;
            if (! $rider || ! $rider->isRider()) {
                continue;
            }
            $days  = (int) $today->diffInDays($doc->expires_at->copy()->startOfDay(), false);
            $date  = $doc->expires_at->format('M j, Y');
            $owner = $doc->store?->user_id;

            if (in_array($days, self::REMIND_DAYS, true)) {
                $n = $days === 1 ? 'day' : 'days';
                NotificationService::send($rider->id, 'system', "Driver's license expires soon",
                    "Your driver's license expires on {$date} ({$days} {$n}). Upload the renewed license in My Documents.", ['link' => '/rider/documents']);
                if ($owner) {
                    NotificationService::send($owner, 'system', "Rider's license expires soon",
                        "{$rider->name}'s driver's license expires on {$date} ({$days} {$n}).", ['link' => "/seller/staff/{$rider->id}"]);
                }
                $sent++;
            } elseif ($days === -1) {
                NotificationService::send($rider->id, 'system', "Driver's license expired",
                    "Your driver's license expired. You can't make deliveries until a renewed license is approved.", ['link' => '/rider/documents']);
                if ($owner) {
                    NotificationService::send($owner, 'system', "Rider's license expired",
                        "{$rider->name}'s driver's license expired. They can't make deliveries until a renewed license is approved.", ['link' => "/seller/staff/{$rider->id}"]);
                }
                $sent++;
            }
        }

        $this->info("Sent {$sent} driver's license notice(s).");

        return self::SUCCESS;
    }
}
