<?php

namespace App\Services;

use App\Models\Commission;
use App\Models\CommissionInvoice;
use App\Models\Setting;
use App\Models\Store;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Commission billing: the platform bills each store periodically for the
 * commissions recorded on its delivered + paid orders. Stores pay through
 * PayMongo (or manually); unpaid invoices lead to a commission suspension
 * that hides the store's products from customers until paid.
 */
class CommissionBillingService
{
    public static function dueDays(): int
    {
        return max(1, (int) Setting::get('commission_invoice_due_days', 7));
    }

    public static function suspendAfterDays(): int
    {
        return max(0, (int) Setting::get('commission_suspend_after_days', 3));
    }

    public static function billingPeriod(): string
    {
        return Setting::get('commission_billing_period', 'monthly') === 'weekly' ? 'weekly' : 'monthly';
    }

    /** [start, end] of the period containing $date for the given billing period. */
    public static function periodFor(string $period, CarbonInterface $date): array
    {
        $date = Carbon::parse($date);
        return $period === 'weekly'
            ? [$date->copy()->startOfWeek(), $date->copy()->endOfWeek()]
            : [$date->copy()->startOfMonth(), $date->copy()->endOfMonth()];
    }

    // ── Generation ────────────────────────────────────────────────────────────

    /**
     * Create one invoice per store for its pending commissions within the period.
     * Commissions are linked to the invoice and marked 'invoiced'. Stores with
     * ₱0 commission are skipped.
     *
     * @return CommissionInvoice[]
     */
    public static function generate(CarbonInterface $start, CarbonInterface $end): array
    {
        $start = Carbon::parse($start)->startOfDay();
        $end   = Carbon::parse($end)->endOfDay();

        $storeIds = Commission::where('status', 'pending')
            ->whereNull('commission_invoice_id')
            ->whereBetween('created_at', [$start, $end])
            ->distinct()
            ->pluck('store_id');

        $created = [];

        foreach ($storeIds as $storeId) {
            $invoice = DB::transaction(function () use ($storeId, $start, $end) {
                // This period's commissions plus anything left uninvoiced from earlier
                // periods (e.g. promo credits that made a previous total ≤ ₱0)
                $commissions = Commission::where('store_id', $storeId)
                    ->where('status', 'pending')
                    ->whereNull('commission_invoice_id')
                    ->where('created_at', '<=', $end)
                    ->lockForUpdate()
                    ->get();

                $amount = round((float) $commissions->sum('commission_amount'), 2);
                if ($commissions->isEmpty() || $amount <= 0) {
                    return null;
                }

                $sales = round((float) $commissions->sum('order_total'), 2);
                $rates = $commissions->pluck('commission_rate')->map(fn ($r) => (float) $r)->unique();
                $rate  = $rates->count() === 1
                    ? $rates->first()
                    : ($sales > 0 ? round($amount / $sales * 100, 2) : 0);

                $invoice = CommissionInvoice::create([
                    'store_id'          => $storeId,
                    'invoice_number'    => static::nextInvoiceNumber(),
                    'period_start'      => $start->toDateString(),
                    'period_end'        => $end->toDateString(),
                    'total_orders'      => $commissions->count(),
                    'total_sales'       => $sales,
                    'commission_rate'   => $rate,
                    'commission_amount' => $amount,
                    'status'            => 'pending',
                    'due_date'          => now()->addDays(static::dueDays())->toDateString(),
                ]);

                Commission::whereIn('id', $commissions->pluck('id'))->update([
                    'status'                => 'invoiced',
                    'commission_invoice_id' => $invoice->id,
                ]);

                return $invoice;
            });

            if ($invoice) {
                $created[] = $invoice;
                NotificationService::sendToStore(
                    $invoice->store_id,
                    'commission',
                    'Commission Invoice Issued',
                    "Your commission invoice {$invoice->invoice_number} for {$invoice->periodLabel()}: ₱"
                        . number_format((float) $invoice->commission_amount, 2)
                        . '. Due by ' . $invoice->due_date->format('M d, Y') . '.',
                    ['invoice_id' => $invoice->id, 'link' => '/seller/commission/' . $invoice->id]
                );
            }
        }

        return $created;
    }

    /**
     * What generate() would bill for the period, without creating anything.
     *
     * @return array{stores:int, orders:int, total:float, breakdown:array<int,array{store_name:string,orders:int,amount:float}>}
     */
    public static function preview(CarbonInterface $start, CarbonInterface $end): array
    {
        $start = Carbon::parse($start)->startOfDay();
        $end   = Carbon::parse($end)->endOfDay();

        // Same selection as generate(): stores active in the period, including carried-over items
        $storeIds = Commission::where('status', 'pending')->whereNull('commission_invoice_id')
            ->whereBetween('created_at', [$start, $end])->distinct()->pluck('store_id');

        $rows = Commission::with('store')
            ->where('status', 'pending')
            ->whereNull('commission_invoice_id')
            ->whereIn('store_id', $storeIds)
            ->where('created_at', '<=', $end)
            ->get()
            ->groupBy('store_id')
            ->map(fn ($group) => [
                'store_name' => $group->first()->store?->store_name ?? '—',
                'orders'     => $group->count(),
                'amount'     => round((float) $group->sum('commission_amount'), 2),
            ])
            ->filter(fn ($r) => $r['amount'] > 0)
            ->sortByDesc('amount')
            ->values();

        return [
            'stores'    => $rows->count(),
            'orders'    => $rows->sum('orders'),
            'total'     => round((float) $rows->sum('amount'), 2),
            'breakdown' => $rows->all(),
        ];
    }

    /** e.g. COMM-2026-09-001 — sequence restarts each month. */
    public static function nextInvoiceNumber(): string
    {
        $prefix = 'COMM-' . now()->format('Y-m') . '-';
        $last   = CommissionInvoice::withTrashed()
            ->where('invoice_number', 'like', $prefix . '%')
            ->orderByDesc('invoice_number')
            ->value('invoice_number');
        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix . str_pad((string) $next, 3, '0', STR_PAD_LEFT);
    }

    // ── Status upkeep ─────────────────────────────────────────────────────────

    /** Flip pending invoices past their due date to 'overdue' (no notifications). */
    public static function markOverdue(): int
    {
        return CommissionInvoice::where('status', 'pending')
            ->whereDate('due_date', '<', now()->toDateString())
            ->update(['status' => 'overdue']);
    }

    /**
     * Daily job: reminders, due-date notices, overdue notices and suspensions.
     *
     * @return array<string,int>
     */
    public static function processDaily(): array
    {
        $today  = now()->startOfDay();
        $counts = ['reminders' => 0, 'due_today' => 0, 'overdue' => 0, 'suspended' => 0];

        static::markOverdue();

        // 2 days before due
        $reminders = CommissionInvoice::with('store')->where('status', 'pending')
            ->whereNull('reminder_sent_at')
            ->whereDate('due_date', '>', $today->toDateString())
            ->whereDate('due_date', '<=', $today->copy()->addDays(2)->toDateString())
            ->get();
        foreach ($reminders as $inv) {
            static::notifySeller($inv, 'Commission Payment Reminder',
                "Commission invoice {$inv->invoice_number} (₱" . number_format((float) $inv->commission_amount, 2)
                . ') is due on ' . $inv->due_date->format('M d, Y') . '.');
            $inv->update(['reminder_sent_at' => now()]);
            $counts['reminders']++;
        }

        // Due today
        $dueToday = CommissionInvoice::where('status', 'pending')
            ->whereNull('due_notice_sent_at')
            ->whereDate('due_date', $today->toDateString())
            ->get();
        foreach ($dueToday as $inv) {
            static::notifySeller($inv, 'Commission Due Today',
                "URGENT: Commission invoice {$inv->invoice_number} (₱" . number_format((float) $inv->commission_amount, 2)
                . ') is due today. Pay now to avoid store suspension.');
            $inv->update(['due_notice_sent_at' => now()]);
            $counts['due_today']++;
        }

        // Overdue (first notice)
        $overdue = CommissionInvoice::with('store')->where('status', 'overdue')
            ->whereNull('overdue_notified_at')
            ->get();
        foreach ($overdue as $inv) {
            $amount = '₱' . number_format((float) $inv->commission_amount, 2);
            $grace  = static::suspendAfterDays();
            static::notifySeller($inv, 'Commission Invoice Overdue',
                "Commission invoice {$inv->invoice_number} ({$amount}) is overdue. Your store will be suspended if it is not paid within {$grace} day(s) of the due date.");
            NotificationService::sendToRole('platform_admin', 'commission', 'Commission Invoice Overdue',
                "{$inv->store?->store_name} has not paid commission invoice {$inv->invoice_number} ({$amount}).",
                ['invoice_id' => $inv->id, 'link' => '/admin/commissions/' . $inv->id]);
            $inv->update(['overdue_notified_at' => now()]);
            $counts['overdue']++;
        }

        // Suspend stores overdue by N+ days
        $cutoff = $today->copy()->subDays(static::suspendAfterDays())->toDateString();
        $storeIds = CommissionInvoice::where('status', 'overdue')
            ->whereDate('due_date', '<=', $cutoff)
            ->distinct()
            ->pluck('store_id');
        foreach (Store::whereIn('id', $storeIds)->where('commission_suspended', false)->get() as $store) {
            static::suspend($store);
            $counts['suspended']++;
        }

        return $counts;
    }

    // ── Suspension ────────────────────────────────────────────────────────────

    public static function outstandingFor(int $storeId): float
    {
        return round((float) CommissionInvoice::where('store_id', $storeId)
            ->whereIn('status', ['pending', 'overdue'])
            ->sum('commission_amount'), 2);
    }

    public static function suspend(Store $store): void
    {
        $store->update(['commission_suspended' => true, 'commission_suspended_at' => now()]);

        $owed = number_format(static::outstandingFor($store->id), 2);
        NotificationService::sendToStore($store->id, 'commission', 'Store Suspended — Unpaid Commission',
            "Your store is suspended due to unpaid commission and your products are hidden from customers. Pay ₱{$owed} to reactivate.",
            ['link' => '/seller/commission']);
        NotificationService::sendToRole('platform_admin', 'commission', 'Store Suspended for Unpaid Commission',
            "{$store->store_name} was automatically suspended (₱{$owed} unpaid commission).",
            ['store_id' => $store->id, 'link' => '/admin/commissions']);
    }

    /** Lift the suspension once no invoice is past the suspension threshold. */
    public static function reactivateIfSettled(int $storeId): void
    {
        $store = Store::find($storeId);
        if (! $store || ! $store->commission_suspended) {
            return;
        }

        $cutoff = now()->startOfDay()->subDays(static::suspendAfterDays())->toDateString();
        $stillBlocking = CommissionInvoice::where('store_id', $storeId)
            ->where('status', 'overdue')
            ->whereDate('due_date', '<=', $cutoff)
            ->exists();
        if ($stillBlocking) {
            return;
        }

        $store->update(['commission_suspended' => false, 'commission_suspended_at' => null]);
        NotificationService::sendToStore($storeId, 'commission', 'Store Reactivated',
            'Thank you for settling your commission. Your store is active again and your products are visible to customers.',
            ['link' => '/seller/commission']);
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    public static function markPaid(CommissionInvoice $invoice, string $method, ?string $reference, bool $byAdmin = false): void
    {
        if ($invoice->status === 'paid') {
            return;
        }

        DB::transaction(function () use ($invoice, $method, $reference) {
            $invoice->update([
                'status'            => 'paid',
                'paid_at'           => now(),
                'payment_method'    => $method,
                'payment_reference' => $reference,
            ]);
            $invoice->commissions()->update(['status' => 'collected', 'collected_at' => now()]);
        });

        $amount = '₱' . number_format((float) $invoice->commission_amount, 2);

        if ($byAdmin) {
            static::notifySeller($invoice, 'Commission Payment Recorded',
                "The platform recorded your payment of {$amount} for invoice {$invoice->invoice_number}. Thank you!");
        } else {
            NotificationService::sendToRole('platform_admin', 'commission', 'Commission Payment Received',
                "Seller {$invoice->store?->store_name} paid commission invoice #{$invoice->invoice_number} ({$amount}).",
                ['invoice_id' => $invoice->id, 'link' => '/admin/commissions/' . $invoice->id]);
        }

        static::reactivateIfSettled($invoice->store_id);
    }

    public static function waive(CommissionInvoice $invoice, ?string $notes): void
    {
        DB::transaction(function () use ($invoice, $notes) {
            $invoice->update(['status' => 'waived', 'notes' => $notes]);
            $invoice->commissions()->update(['status' => 'waived']);
        });

        static::notifySeller($invoice, 'Commission Invoice Waived',
            "Commission invoice {$invoice->invoice_number} (₱" . number_format((float) $invoice->commission_amount, 2) . ') has been waived by the platform.');

        static::reactivateIfSettled($invoice->store_id);
    }

    public static function notifySeller(CommissionInvoice $invoice, string $title, string $message): void
    {
        NotificationService::sendToStore($invoice->store_id, 'commission', $title, $message, [
            'invoice_id' => $invoice->id,
            'link'       => '/seller/commission/' . $invoice->id,
        ]);
    }
}
