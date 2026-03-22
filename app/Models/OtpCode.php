<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OtpCode extends Model
{
    protected $fillable = [
        'user_id',
        'code',
        'expires_at',
        'used',
        'attempts',
        'locked_until',
    ];

    protected $casts = [
        'expires_at'   => 'datetime',
        'locked_until' => 'datetime',
        'used'         => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    /**
     * Generate a new 6-digit OTP for the given user.
     * Marks any previous unused codes as used first.
     */
    public static function generateFor(User $user): self
    {
        // Invalidate all previous codes for this user
        self::where('user_id', $user->id)
            ->where('used', false)
            ->update(['used' => true]);

        return self::create([
            'user_id'    => $user->id,
            'code'       => str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT),
            'expires_at' => now()->addMinutes(10),
            'used'       => false,
            'attempts'   => 0,
        ]);
    }

    /**
     * Get the latest active (unused, unexpired) OTP for a user.
     */
    public static function latestActiveFor(User $user): ?self
    {
        return self::where('user_id', $user->id)
            ->where('used', false)
            ->where('expires_at', '>', now())
            ->latest()
            ->first();
    }
}
