<?php

namespace App\Services;

use Illuminate\Http\Request;

/**
 * Extended LoginRateLimiter with 3-minute lockout (180s) instead of Fortify's default 60s.
 */
class LoginRateLimiter extends \Laravel\Fortify\LoginRateLimiter
{
    /**
     * Increment the login attempts using a 180-second (3-minute) decay window.
     */
    public function increment(Request $request): void
    {
        $this->limiter->hit($this->throttleKey($request), 180);
    }

    /**
     * Get remaining attempts before lockout.
     */
    public function remaining(Request $request): int
    {
        return $this->limiter->remaining($this->throttleKey($request), 5);
    }
}
