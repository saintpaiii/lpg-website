<?php

namespace App\Support;

use App\Models\Store;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * The store permits sellers upload, which ones expire, and their status.
 * Dates are compared in Asia/Manila.
 */
class StoreDocuments
{
    /** key => [label, expiry column (null = does not expire)] */
    public const TYPES = [
        'bir_permit'      => ['label' => 'BIR Certificate of Registration',           'expiry' => null],
        'business_permit' => ['label' => "Business / Mayor's Permit",                 'expiry' => 'business_permit_expires_at'],
        'fsic_permit'     => ['label' => 'Fire Safety Inspection Certificate (FSIC)', 'expiry' => 'fsic_permit_expires_at'],
        'doe_lpg_license' => ['label' => 'DOE LPG License',                           'expiry' => 'doe_lpg_license_expires_at'],
        'lto_permit'      => ['label' => 'License to Operate (LTO)',                  'expiry' => 'lto_permit_expires_at'],
    ];

    /** A permit expired longer than this hides the store from customers. */
    public const GRACE_DAYS = 7;

    /** Days before expiry when the owner is reminded. */
    public const REMIND_DAYS = [30, 7, 1];

    /** Max rejected uploads per document (and seller applications) within 30 days. */
    public const MAX_REJECTIONS = 5;

    /** Validation for the "Valid until" dates on the seller application forms. */
    public static function expiryRules(): array
    {
        $rule = ['required', 'date', 'after:today', 'before_or_equal:' . self::today()->addYears(5)->toDateString()];

        return collect(self::expiringTypes())->mapWithKeys(fn ($t) => [self::expiryColumn($t) => $rule])->all();
    }

    public static function expiryMessages(): array
    {
        $m = [];
        foreach (self::expiringTypes() as $t) {
            $col = self::expiryColumn($t);
            $m["{$col}.required"]        = 'Please enter the date your ' . self::label($t) . ' is valid until.';
            $m["{$col}.after"]           = 'The ' . self::label($t) . ' must still be valid (date after today).';
            $m["{$col}.before_or_equal"] = 'Please check the ' . self::label($t) . ' date (at most 5 years ahead).';
        }

        return $m;
    }

    public static function label(string $type): string
    {
        return self::TYPES[$type]['label'] ?? $type;
    }

    public static function expiryColumn(string $type): ?string
    {
        return self::TYPES[$type]['expiry'] ?? null;
    }

    /** Types that have an expiry date. */
    public static function expiringTypes(): array
    {
        return array_keys(array_filter(self::TYPES, fn ($t) => $t['expiry'] !== null));
    }

    public static function today(): CarbonInterface
    {
        return Carbon::now('Asia/Manila')->startOfDay();
    }

    public static function expiry(Store $store, string $type): ?CarbonInterface
    {
        $col = self::expiryColumn($type);
        $date = $col ? $store->{$col} : null;

        return $date ? Carbon::parse($date->format('Y-m-d'), 'Asia/Manila')->startOfDay() : null;
    }

    /** Whole days until expiry (negative once expired); null without a date. */
    public static function daysLeft(Store $store, string $type): ?int
    {
        $exp = self::expiry($store, $type);

        return $exp ? (int) self::today()->diffInDays($exp, false) : null;
    }

    /** 'valid' | 'expiring' (≤ 30 days left) | 'expired' (date before today) | 'no_date' | 'no_expiry' (BIR) */
    public static function statusFor(Store $store, string $type): string
    {
        if (! self::expiryColumn($type)) {
            return 'no_expiry';
        }
        $days = self::daysLeft($store, $type);

        return match (true) {
            $days === null => 'no_date',
            $days < 0      => 'expired',
            $days <= 30    => 'expiring',
            default        => 'valid',
        };
    }

    /** Card / badge data for one permit. */
    public static function summary(Store $store, string $type): array
    {
        $exp = self::expiry($store, $type);

        return [
            'type'       => $type,
            'label'      => self::label($type),
            'expires'    => $exp?->toDateString(),
            'expires_on' => $exp?->format('M d, Y'),
            'days_left'  => self::daysLeft($store, $type),
            'status'     => self::statusFor($store, $type),
        ];
    }

    /**
     * The most urgent permit problem for the seller banner (expired, or expiring within 7 days), or null.
     * Uses only the store row.
     */
    public static function alertFor(Store $store): ?array
    {
        $worst = null;
        foreach (self::expiringTypes() as $type) {
            $days = self::daysLeft($store, $type);
            if ($days === null || $days > 7) {
                continue;
            }
            if ($worst === null || $days < $worst['days_left']) {
                $worst = self::summary($store, $type);
            }
        }

        return $worst ? ['label' => $worst['label'], 'date' => $worst['expires_on'], 'status' => $worst['status'], 'days_left' => $worst['days_left']] : null;
    }
}
