<?php

namespace App\Support;

use App\Events\RealtimeEvent;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Safe live-update dispatch. Broadcasting must never break a request:
 *  - skipped entirely unless BROADCAST_CONNECTION=pusher and the Pusher keys are set
 *  - errors are logged, not thrown; after a failure we pause broadcasting for a minute so an
 *    unreachable Pusher doesn't slow every request (pages fall back to polling meanwhile)
 *  - inside a DB transaction the event waits for the commit (no updates for rolled-back changes)
 */
class Realtime
{
    private const DOWN_KEY = 'realtime:pusher-down';

    public static function enabled(): bool
    {
        return config('broadcasting.default') === 'pusher'
            && filled(config('broadcasting.connections.pusher.key'))
            && filled(config('broadcasting.connections.pusher.secret'))
            && filled(config('broadcasting.connections.pusher.app_id'));
    }

    /** @var array<int, RealtimeEvent> events waiting until the response has been sent */
    private static array $pending = [];

    public static function send(RealtimeEvent $event): void
    {
        if (! static::enabled()) {
            return;
        }
        DB::afterCommit(function () use ($event) {
            // Each Pusher call takes a few hundred ms. In web requests send them after the response
            // has gone out (Laravel's terminate phase — PHP-FPM / LiteSpeed finish the request first),
            // so nobody waits on Pusher. Console commands send right away.
            if (app()->runningInConsole()) {
                static::push($event);
                return;
            }
            if (static::$pending === []) {
                app()->terminating(fn () => static::flush());
            }
            static::$pending[] = $event;
        });
    }

    public static function flush(): void
    {
        $events = static::$pending;
        static::$pending = [];
        foreach ($events as $event) {
            static::push($event);
        }
    }

    private static function push(RealtimeEvent $event): void
    {
        if (Cache::get(self::DOWN_KEY)) {
            return;
        }
        try {
            broadcast($event);
        } catch (\Throwable $e) {
            Cache::put(self::DOWN_KEY, true, now()->addMinute());
            Log::warning('Realtime broadcast failed (pages will keep polling)', [
                'event' => class_basename($event), 'error' => $e->getMessage(),
            ]);
        }
    }
}
