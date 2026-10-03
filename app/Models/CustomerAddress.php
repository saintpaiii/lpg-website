<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A customer's saved delivery address (Home, Office, …). One per user can be the default. */
class CustomerAddress extends Model
{
    use SoftDeletes;

    public const LABELS = ['Home', 'Office', 'Other'];

    protected $fillable = [
        'user_id', 'label', 'address_line', 'barangay', 'city', 'province',
        'latitude', 'longitude', 'is_default',
    ];

    protected $casts = [
        'latitude'   => 'float',
        'longitude'  => 'float',
        'is_default' => 'boolean',
    ];

    protected static function booted(): void
    {
        // Only one default per user
        static::saved(function (CustomerAddress $a) {
            if ($a->is_default && ($a->wasRecentlyCreated || $a->wasChanged('is_default'))) {
                static::where('user_id', $a->user_id)->whereKeyNot($a->id)->where('is_default', true)->update(['is_default' => false]);
            }
        });

        // Deleting the default promotes the next most recent address
        static::deleted(function (CustomerAddress $a) {
            if ($a->is_default && ! static::where('user_id', $a->user_id)->where('is_default', true)->exists()) {
                static::where('user_id', $a->user_id)->latest('updated_at')->first()?->update(['is_default' => true]);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** "Street, Barangay, City" */
    public function fullText(): string
    {
        return collect([$this->address_line, $this->barangay, $this->city])->filter()->implode(', ');
    }

    public function toFrontend(): array
    {
        return [
            'id'           => $this->id,
            'label'        => $this->label,
            'address_line' => $this->address_line,
            'barangay'     => $this->barangay,
            'city'         => $this->city,
            'full_text'    => $this->fullText(),
            'latitude'     => $this->latitude,
            'longitude'    => $this->longitude,
            'is_default'   => $this->is_default,
        ];
    }
}
