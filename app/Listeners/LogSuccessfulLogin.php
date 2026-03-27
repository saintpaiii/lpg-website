<?php

namespace App\Listeners;

use App\Models\AuthLog;
use Illuminate\Auth\Events\Login;

class LogSuccessfulLogin
{
    public function handle(Login $event): void
    {
        AuthLog::record([
            'user_id' => $event->user->id,
            'email'   => $event->user->email,
            'action'  => 'login_success',
            'status'  => 'success',
        ]);

        // Clear any stored throttle state so the login page is clean next time.
        request()->session()->forget(['login.remaining', 'login.locked_until']);
    }
}
