<?php

namespace App\Console\Commands;

use App\Services\CommissionBillingService;
use Illuminate\Console\Command;

/**
 * Daily commission billing job:
 *  - on the first day of a billing period, invoice the previous period
 *  - mark overdue invoices, send reminders / due / overdue notices
 *  - suspend stores whose invoices are overdue past the grace period
 */
class ProcessCommissionInvoices extends Command
{
    protected $signature   = 'commissions:process-invoices {--generate : Force invoice generation for the previous billing period}';
    protected $description = 'Generate periodic commission invoices, send reminders and suspend stores with overdue invoices.';

    public function handle(): int
    {
        $period  = CommissionBillingService::billingPeriod();
        $today   = now();
        $isStart = $period === 'weekly' ? $today->isMonday() : $today->day === 1;

        if ($isStart || $this->option('generate')) {
            [$start, $end] = CommissionBillingService::periodFor($period, $today->copy()->subDay());
            $invoices = CommissionBillingService::generate($start, $end);
            $this->info(sprintf('Generated %d %s invoice(s) for %s – %s.', count($invoices), $period, $start->toDateString(), $end->toDateString()));
        }

        $counts = CommissionBillingService::processDaily();
        $this->info(sprintf(
            'Reminders: %d · Due today: %d · Overdue notices: %d · Stores suspended: %d',
            $counts['reminders'], $counts['due_today'], $counts['overdue'], $counts['suspended']
        ));

        return self::SUCCESS;
    }
}
