<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Philippine phone number for a STORE (J6): mobile 09XXXXXXXXX / +639XXXXXXXXX, or a landline —
 * (046) 483-5678, 046-483-5678, (02) 8123-4567, 02-8123-4567 — with or without spaces, dashes or parentheses.
 * Normalised for the check only (strip spaces/dashes/parentheses/dots, +63 → 0); the value is saved as typed (trimmed).
 * Personal / user / staff phones stay mobile-only (OTP / SMS) — don't use this rule for them.
 */
class PhPhone implements ValidationRule
{
    public const MESSAGE = 'Enter the store\'s phone number: 09XXXXXXXXX or a landline like (046) 483-5678.';

    public function __construct(private bool $allowLandline = true)
    {
    }

    /** Digits only, +63 / 63 → 0 (e.g. "+63 917 123 4567" → "09171234567", "(046) 483-5678" → "0464835678"). */
    public static function normalize(?string $value): string
    {
        $digits = preg_replace('/[\s\-().]/', '', trim((string) $value));
        if (str_starts_with($digits, '+63')) {
            $digits = '0' . substr($digits, 3);
        } elseif (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0' . substr($digits, 2);
        }

        return $digits;
    }

    public static function isMobile(?string $value): bool
    {
        return (bool) preg_match('/^09\d{9}$/', static::normalize($value));
    }

    public static function isLandline(?string $value): bool
    {
        $n = static::normalize($value);

        // Metro Manila (02) + 8 digits · provincial (0AA) + 7 digits
        return (bool) (preg_match('/^02\d{8}$/', $n) || preg_match('/^0[3-8]\d\d{7}$/', $n));
    }

    public static function valid(?string $value, bool $allowLandline = true): bool
    {
        return static::isMobile($value) || ($allowLandline && static::isLandline($value));
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! static::valid($value, $this->allowLandline)) {
            $fail($this->allowLandline ? self::MESSAGE : 'Enter a mobile number (09XXXXXXXXX).');
        }
    }
}
