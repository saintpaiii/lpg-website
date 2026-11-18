<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\SalesHistoryDemoService;
use Illuminate\Console\Command;

/**
 * J8: generate DEMO sales history (sales_history, source 'demo') for one store — for demo / local databases only.
 * It never creates orders, invoices or receipts. Re-running replaces the store's previous demo rows.
 */
class SalesHistoryDemo extends Command
{
    protected $signature   = 'sales-history:demo {store : The store id} {--years=2 : Years of history} {--force : Run outside local/testing (writes DEMO data)}';
    protected $description = 'Generate demo (fake) seasonal sales history for a store — local / testing databases only.';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing']) && ! $this->option('force')) {
            $this->error('Refusing: APP_ENV is "' . app()->environment() . '". This writes DEMO (generated) sales history — use --force only on a demo database.');

            return self::FAILURE;
        }
        if ($this->option('force')) {
            $this->warn('Warning: this writes GENERATED demo sales history (not real sales) for the store.');
        }
        $store = Store::find((int) $this->argument('store'));
        if (! $store) {
            $this->error('Store not found.');

            return self::FAILURE;
        }
        $started = microtime(true);
        $n = SalesHistoryDemoService::generate($store, max(1, (int) $this->option('years')));
        $this->info(sprintf('Demo sales history for "%s": %d day-rows (%.1fs). Previous demo rows were replaced.', $store->store_name, $n, microtime(true) - $started));

        return self::SUCCESS;
    }
}
