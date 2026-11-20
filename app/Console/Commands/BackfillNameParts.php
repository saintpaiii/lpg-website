<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * K11 — fill users.first_name / last_name from users.name where BOTH are empty (older and seeded accounts), so the
 * profile forms are prefilled. Safe on live data and safe to run again: rows with a first or last name are untouched.
 * The migration 2026_11_24_000012 runs it once; this command is for running it again by hand.
 */
class BackfillNameParts extends Command
{
    protected $signature = 'users:backfill-names';

    protected $description = 'Fill empty first_name / last_name from the full name (only rows where both are empty).';

    public function handle(): int
    {
        $n = User::backfillNameParts();
        $this->info("Filled first / last name for {$n} account(s).");

        return self::SUCCESS;
    }
}
