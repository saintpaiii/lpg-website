<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\WalletTransaction;
use App\Services\WalletService;
use Illuminate\Console\Command;

class WalletBackfill extends Command
{
    protected $signature   = 'wallet:backfill';
    protected $description = 'Credit seller wallets for all delivered orders that have no wallet transaction yet.';

    public function handle(): int
    {
        // Find delivered orders that have no credit transaction yet
        $creditedOrderIds = WalletTransaction::where('type', 'credit')
            ->whereNotNull('order_id')
            ->pluck('order_id')
            ->toArray();

        $orders = Order::where('status', 'delivered')
            ->whereNotIn('id', $creditedOrderIds)
            ->get();

        if ($orders->isEmpty()) {
            $this->info('No unprocessed delivered orders found. Nothing to do.');
            return self::SUCCESS;
        }

        $this->info("Found {$orders->count()} delivered order(s) without wallet credits. Processing...");
        $this->newLine();

        $credited = 0;
        $skipped  = 0;
        $noStore  = 0;

        foreach ($orders as $order) {
            if (! $order->store_id) {
                $this->line("  <comment>SKIP</comment>  Order #{$order->order_number} — no store linked.");
                $noStore++;
                continue;
            }

            WalletService::creditOrder($order);

            // Verify a transaction was actually created
            $tx = WalletTransaction::where('order_id', $order->id)->where('type', 'credit')->first();

            if ($tx) {
                $amount     = number_format((float) $tx->amount, 2);
                $commission = number_format((float) ($tx->commission ?? 0), 2);
                $this->line("  <info>OK</info>  Order #{$order->order_number} — ₱{$amount} credited (₱{$commission} commission deducted) → store #{$order->store_id}");
                $credited++;
            } else {
                $this->line("  <error>FAIL</error>  Order #{$order->order_number} — nothing written (net amount may be ₱0 or store missing).");
                $skipped++;
            }
        }

        $this->newLine();
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        $this->info("Credited : {$credited}");
        if ($skipped > 0) {
            $this->warn("Skipped  : {$skipped}");
        }
        if ($noStore > 0) {
            $this->warn("No store : {$noStore}");
        }
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        return self::SUCCESS;
    }
}
