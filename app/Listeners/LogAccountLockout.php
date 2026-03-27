<?php

namespace App\Listeners;

use App\Models\AuthLog;
use App\Models\User;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Cache\RateLimiter;
use Illuminate\Support\Str;

class LogAccountLockout
{
    public function handle(Lockout $event): void
    {
        $email = $event->request->input('email', '');
        $user  = $email ? User::withTrashed()->where('email', $email)->first() : null;

        AuthLog::create([
            'user_id'        => $user?->id,
            'email'          => $email,
            'action'         => 'account_locked',
            'ip_address'     => $event->request->ip(),
            'user_agent'     => $event->request->userAgent(),
            'status'         => 'failed',
            'failure_reason' => 'too_many_attempts',
        ]);

        // Store lockout expiry in session so the login view can show the countdown.
        $throttleKey = Str::transliterate(Str::lower($email) . '|' . $event->request->ip());
        $retryAfter  = app(RateLimiter::class)->availableIn($throttleKey);
        $event->request->session()->put('login.locked_until', now()->addSeconds($retryAfter)->timestamp);
        $event->request->session()->forget('login.remaining');
    }
}
