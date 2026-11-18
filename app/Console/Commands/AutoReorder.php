<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\ReorderService;
use Illuminate\Console\Command;

/** J7: daily — draft (never send) purchase orders for products at / below their reorder point, one draft per supplier. */
class AutoReorder extends Command
{
    protected $signature   = 'inventory:auto-reorder';
    protected $description = 'Draft purchase orders for products at or below their reorder point (stores with auto-reorder on).';

    public function handle(): int
    {
        $drafts = 0;
        Store::where('status', 'approved')->where('auto_reorder_enabled', true)->orderBy('id')
            ->each(function (Store $store) use (&$drafts) {
                $drafts += count(ReorderService::checkStore($store));
            });
        $this->info("Auto-reorder: {$drafts} draft purchase order(s) created or updated.");

        return self::SUCCESS;
    }
}
