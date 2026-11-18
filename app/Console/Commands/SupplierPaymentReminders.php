<?php

namespace App\Console\Commands;

use App\Services\SupplierPaymentService;
use Illuminate\Console\Command;

/**
 * K6: purchase orders whose supplier payment is due tomorrow or overdue — ONE notification to the store owner per PO
 * per kind (due tomorrow / overdue). Idempotent: the kinds already sent are kept in purchase_orders.payment_reminders.
 */
class SupplierPaymentReminders extends Command
{
    protected $signature   = 'purchase-orders:payment-reminders';
    protected $description = 'Remind store owners about supplier payments due tomorrow or overdue (once per PO per kind).';

    public function handle(): int
    {
        $sent = SupplierPaymentService::sendReminders();
        $this->info("Supplier payment reminders sent: {$sent}.");

        return self::SUCCESS;
    }
}
