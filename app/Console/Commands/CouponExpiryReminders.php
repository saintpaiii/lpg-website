<?php

namespace App\Console\Commands;

use App\Models\Coupon;
use App\Models\CouponUse;
use App\Models\User;
use App\Services\CouponService;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/** Remind customers about active coupons expiring within the next day that they haven't used. */
class CouponExpiryReminders extends Command
{
    protected $signature   = 'coupons:expiry-reminders';
    protected $description = 'Notify customers about coupons that expire within 24 hours.';

    public function handle(): int
    {
        $coupons = Coupon::with('store')
            ->where('is_active', true)
            ->whereNull('expiry_notified_at')
            ->whereBetween('expires_at', [now(), now()->addDay()])
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->get();

        $sent = 0;
        foreach ($coupons as $coupon) {
            if ($coupon->state() !== 'active') {
                continue;
            }

            $audience = $coupon->type === 'platform'
                ? User::where('role', 'customer')->pluck('id')->all()
                : CouponService::storeCustomerUserIds($coupon->store_id);

            $used    = CouponUse::where('coupon_id', $coupon->id)->distinct()->pluck('user_id')->all();
            $targets = array_values(array_diff($audience, $used));

            $where = $coupon->type === 'store' ? " at {$coupon->store?->store_name}" : '';
            NotificationService::sendToMany($targets, 'promo', 'Coupon Expiring Soon',
                "Last chance! Code {$coupon->code} ({$coupon->label()}{$where}) expires " . $coupon->expires_at->format('M d, g:i A') . '.',
                ['coupon_code' => $coupon->code, 'link' => $coupon->type === 'store' ? '/customer/store/' . $coupon->store_id : '/customer/products']);

            $coupon->update(['expiry_notified_at' => now()]);
            $sent += count($targets);
        }

        $this->info("Sent {$sent} expiry reminder(s) for {$coupons->count()} coupon(s).");

        return self::SUCCESS;
    }
}
