<?php

namespace App\Console\Commands;

use App\Services\SubscriptionService;
use Illuminate\Console\Command;

/** Plan reminders (last 3 days), end-of-plan notices, cancelling abandoned checkouts and unanswered cash requests. */
class ProcessSubscriptions extends Command
{
    protected $signature   = 'subscriptions:process';
    protected $description = 'Send plan reminders and end-of-plan notices; cancel stale plan checkouts.';

    public function handle(): int
    {
        $counts = SubscriptionService::runHourly();

        $this->info("Reminders sent: {$counts['reminded']} · Plans ended: {$counts['expired']} · Stale checkouts cancelled: {$counts['cancelled']} · Cash requests expired: {$counts['cash_expired']}");

        return self::SUCCESS;
    }
}
