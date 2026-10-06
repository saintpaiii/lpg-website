<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Base for live updates pushed through Pusher. Sent immediately (no queue worker needed on
 * shared hosting). Always dispatch through App\Support\Realtime::send(), never broadcast() directly.
 *
 * @param array<int, string> $channels private channel names, e.g. ['user.5', 'store.2']
 */
abstract class RealtimeEvent implements ShouldBroadcastNow
{
    public function __construct(public array $payload, protected array $channels) {}

    public function broadcastOn(): array
    {
        return array_map(fn (string $name) => new PrivateChannel($name), array_values(array_unique($this->channels)));
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }

    /** Frontend listens with Echo `.listen('.MessageSent', …)` etc. */
    public function broadcastAs(): string
    {
        return class_basename(static::class);
    }
}
