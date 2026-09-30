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
