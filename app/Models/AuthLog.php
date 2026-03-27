<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuthLog extends Model
{
    // No soft deletes — auth logs are immutable audit records

    protected $fillable = [
        'user_id',
        'email',
        'action',
        'ip_address',
        'user_agent',
        'status',
        'failure_reason',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    /**
     * Create a log entry, automatically injecting the current request IP and user agent.
     */
    public static function record(array $data): static
    {
        return static::create(array_merge([
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ], $data));
    }
}
