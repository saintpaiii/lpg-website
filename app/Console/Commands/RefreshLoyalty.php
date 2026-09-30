<?php

namespace App\Console\Commands;

use App\Services\LoyaltyService;
use Illuminate\Console\Command;

/** Daily: recalculate trust scores (recency decays) and demote inactive or low-trust customers. */
class RefreshLoyalty extends Command
{
    protected $signature   = 'loyalty:refresh';
    protected $description = 'Recalculate loyalty trust scores and apply inactivity/low-trust tier demotions.';

    public function handle(): int
    {
        $demoted = LoyaltyService::refreshAll();
        $this->info("Loyalty refreshed. {$demoted} tier demotion(s).");

        return self::SUCCESS;
    }
}
