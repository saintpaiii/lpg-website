<?php

namespace App\Console\Commands;

use App\Models\UserReport;
use App\Services\ReportService;
use Illuminate\Console\Command;

/**
 * Hourly report housekeeping (idempotent):
 *  1. Store-handled reports the store never responded to within 48 h → sent to the admin.
 *     Keyed on store_first_response_at (any store reply or step counts), so a customer's or admin's
 *     comment doesn't stop the clock, and on store_assigned_at, so a report the admin just sent to
 *     the store gets a fresh 48 h.
 *  2. A proposed resolution (store or admin) the reporter didn't answer within 72 h → closed as
 *     solved ("fixed" for website problems). Gas leaks only close this way with resolution photos.
 *  3. Store-handled reports with no store activity for 24 h → admins are told once
 *     (user_reports.admin_idle_alert_sent_at).
 */
class ReportsAutoEscalate extends Command
{
    protected $signature = 'reports:auto-escalate';

    protected $description = 'Send unanswered store reports to the admin (48 h) and close unanswered resolutions (72 h).';

    public function handle(): int
    {
        $escalated = 0;
        UserReport::where('route', 'store')->whereNull('escalated_at')
            ->whereIn('status', ReportService::ACTIVE)
            ->whereNull('store_first_response_at')
            ->whereRaw('COALESCE(store_assigned_at, created_at) <= ?', [now()->subHours(48)])
            ->orderBy('id')->each(function (UserReport $r) use (&$escalated) {
                ReportService::escalate($r, null, 'auto');
                $escalated++;
            });

        $closed = 0;
        UserReport::where('status', UserReport::AWAITING)
            ->whereRaw('COALESCE(resolution_proposed_at, store_marked_fixed_at) <= ?', [now()->subHours(72)])
            ->where(fn ($q) => $q->where('category', '!=', 'gas_leak')->orWhereNotNull('resolution_photos'))
            ->orderBy('id')->each(function (UserReport $r) use (&$closed) {
                ReportService::autoClose($r);
                $closed++;
            });

        // 3. Heads-up to admins (once per report): a store-handled report with no store activity for 24 h
        $idle = 0;
        ReportService::monitoringList()->whereNull('admin_idle_alert_sent_at')
            ->whereRaw(ReportService::idleSinceSql() . ' <= ?', [now()->subHours(24)])
            ->orderBy('id')->get()->each(function (UserReport $r) use (&$idle) {
                ReportService::alertAdminsIdle($r);
                $idle++;
            });

        $this->info("Sent {$escalated} report(s) to the admin; closed {$closed} unanswered resolution(s); {$idle} idle alert(s) to admins.");

        return self::SUCCESS;
    }
}
