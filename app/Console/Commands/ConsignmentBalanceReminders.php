<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Daily consignment balance notifications:
 *  - customer reminder 2 days before the balance due date
 *  - seller (and customer) notice once the balance is overdue
 */
class ConsignmentBalanceReminders extends Command
{
    protected $signature   = 'consignment:balance-reminders';
    protected $description = 'Send consignment balance due reminders and overdue notices.';

    public function handle(): int
    {
        $today = now()->startOfDay();

        $outstanding = Order::with(['customer', 'store'])
            ->where('payment_mode', 'consignment')
            ->where('payment_status', 'partial')
            ->whereNotNull('balance_due_date');

        // ── 2-day reminder ────────────────────────────────────────────────────
        $reminders = (clone $outstanding)
            ->whereNull('balance_reminder_sent_at')
            ->whereDate('balance_due_date', '>=', $today->toDateString())
            ->whereDate('balance_due_date', '<=', $today->copy()->addDays(2)->toDateString())
            ->get();

        foreach ($reminders as $order) {
            if ($userId = $order->customer?->user_id) {
                $days = (int) $today->diffInDays($order->balance_due_date, false);
                $when = $days <= 0 ? 'today' : "in {$days} day(s)";
                NotificationService::send(
                    $userId,
                    'payment',
                    'Balance Payment Reminder',
                    "Your remaining balance of ₱" . number_format((float) $order->remaining_balance, 2)
                        . " for order {$order->order_number} is due {$when} ("
                        . $order->balance_due_date->format('M d, Y') . ').',
                    ['order_id' => $order->id, 'link' => '/customer/orders/' . $order->id]
                );
            }
            $order->update(['balance_reminder_sent_at' => now()]);
        }

        // ── Overdue ───────────────────────────────────────────────────────────
        $overdue = (clone $outstanding)
            ->whereNull('balance_overdue_notified_at')
            ->whereDate('balance_due_date', '<', $today->toDateString())
            ->get();

        foreach ($overdue as $order) {
            $amount = '₱' . number_format((float) $order->remaining_balance, 2);

            if ($order->store_id) {
                NotificationService::sendToStore(
                    $order->store_id,
                    'payment',
                    'Consignment Balance Overdue',
                    "Order {$order->order_number} ({$order->customer?->name}) has an overdue balance of {$amount} — due "
                        . $order->balance_due_date->format('M d, Y') . '.',
                    ['order_id' => $order->id, 'link' => '/seller/orders/' . $order->id]
                );
            }
            if ($userId = $order->customer?->user_id) {
                NotificationService::send(
                    $userId,
                    'payment',
                    'Balance Payment Overdue',
                    "Your balance of {$amount} for order {$order->order_number} is overdue. Please settle it as soon as possible.",
                    ['order_id' => $order->id, 'link' => '/customer/orders/' . $order->id]
                );
            }
            $order->update(['balance_overdue_notified_at' => now()]);
        }

        $this->info("Sent {$reminders->count()} reminder(s) and {$overdue->count()} overdue notice(s).");

        return self::SUCCESS;
    }
}
