<?php

namespace App\Listeners;

use App\Models\AuthLog;
use Illuminate\Auth\Events\Failed;
use Illuminate\Cache\RateLimiter;
use Illuminate\Support\Str;

class LogFailedLogin
{
    public function handle(Failed $event): void
    {
        $email = $event->credentials['email'] ?? '';

        $reason = match (true) {
            $event->user === null                                                            => 'email_not_found',
            method_exists($event->user, 'trashed') && $event->user->trashed()              => 'account_archived',
            isset($event->user->is_active) && ! $event->user->is_active                    => 'account_deactivated',
            default                                                                          => 'invalid_password',
        };

        AuthLog::record([
            'user_id'        => $event->user?->id,
            'email'          => $email,
            'action'         => 'login_failed',
            'status'         => 'failed',
            'failure_reason' => $reason,
        ]);

        // Store remaining attempts in session so the login view can show a warning.
        // Note: increment() hasn't fired yet when Failed event fires, so we subtract 1.
        $throttleKey = Str::transliterate(Str::lower($email) . '|' . request()->ip());
        $remaining   = max(0, app(RateLimiter::class)->remaining($throttleKey, 5) - 1);
        request()->session()->put('login.remaining', $remaining);
    }
}
