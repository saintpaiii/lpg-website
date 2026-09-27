<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\OrderPaymentService;
use Illuminate\Console\Command;

class CommissionBackfill extends Command
{
    protected $signature   = 'commissions:backfill';
    protected $description = 'Create commission records for delivered + paid orders that do not have one yet.';

    public function handle(): int
    {
        $orders = Order::withTrashed()
            ->where('status', 'delivered')
            ->where('payment_status', 'paid')
            ->whereNotNull('store_id')
            ->whereDoesntHave('commission')
            ->get();

        $created = 0;
        foreach ($orders as $order) {
            if ($commission = OrderPaymentService::recordCommission($order)) {
                // Date the record by when the sale completed, not when it was backfilled
                if ($order->delivered_at) {
                    $commission->timestamps = false;
                    $commission->forceFill(['created_at' => $order->delivered_at, 'updated_at' => now()])->save();
                }
                $created++;
            }
        }

        $this->info("Created {$created} commission record(s) from {$orders->count()} eligible order(s).");

        return self::SUCCESS;
    }
}
