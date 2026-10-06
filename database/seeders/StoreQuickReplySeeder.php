<?php

namespace Database\Seeders;

use App\Models\Store;
use App\Models\StoreQuickReply;
use Illuminate\Database\Seeder;

/** Default chat quick replies for every store that has none. Safe to re-run. */
class StoreQuickReplySeeder extends Seeder
{
    public function run(): void
    {
        $added = 0;
        Store::query()->pluck('id')->each(function ($id) use (&$added) {
            $added += StoreQuickReply::ensureDefaults($id) > 0 ? 1 : 0;
        });
        $this->command?->info("Default quick replies added to {$added} store(s).");
    }
}
