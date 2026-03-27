<?php

namespace App\Listeners;

use App\Models\AuthLog;
use Illuminate\Auth\Events\Logout;

class LogLogout
{
    public function handle(Logout $event): void
    {
        if (! $event->user) {
            return;
        }

        AuthLog::record([
            'user_id' => $event->user->id,
            'email'   => $event->user->email,
            'action'  => 'logout',
            'status'  => 'success',
        ]);
    }
}
