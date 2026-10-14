<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Consignment: remind customers 2 days before the balance is due, flag overdue balances
Schedule::command('consignment:balance-reminders')->dailyAt('08:00');

// Commission billing: periodic invoices, reminders, overdue notices, auto-suspension
Schedule::command('commissions:process-invoices')->dailyAt('07:00');

// Coupons expiring within a day → remind customers who haven't used them
Schedule::command('coupons:expiry-reminders')->dailyAt('09:00');

// Loyalty: recency decay of trust scores + inactivity / low-trust tier demotions
Schedule::command('loyalty:refresh')->dailyAt('02:00');

// Reports: unanswered store reports go to the admin after 48 h; unconfirmed fixes close after 72 h
Schedule::command('reports:auto-escalate')->hourly()->withoutOverlapping();

// Online orders whose PayMongo payment wasn't completed within 60 minutes are cancelled (stock/notifications via the customer-cancel path)
Schedule::command('orders:cancel-unpaid')->everyFifteenMinutes()->withoutOverlapping();

// Store permits: reminders 30/7/1 days before expiry; hide stores whose permit expired more than 7 days ago
Schedule::command('stores:check-documents')->dailyAt('06:00')->withoutOverlapping();
