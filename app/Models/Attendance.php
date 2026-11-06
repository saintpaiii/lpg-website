<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Attendance extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'store_id',
        'date',
        'clock_in',
        'clock_in_latitude',
        'clock_in_longitude',
        'clock_out',
        'clock_out_latitude',
        'clock_out_longitude',
        'status',
        'overtime_hours',
        'is_late',
        'is_extra_day',   // clocked in on a day off (paid normally)
        'notes',
        'vehicle_id',
    ];

    protected function casts(): array
    {
        return [
            'date'           => 'date',
            'clock_in'       => 'datetime',
            'clock_out'      => 'datetime',
            'overtime_hours'      => 'decimal:2',
            'is_late'             => 'boolean',
            'is_extra_day'        => 'boolean',
            'clock_in_latitude'   => 'decimal:7',
            'clock_in_longitude'  => 'decimal:7',
            'clock_out_latitude'  => 'decimal:7',
            'clock_out_longitude' => 'decimal:7',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Rider: the vehicle taken for this shift (held until clock-out). */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
