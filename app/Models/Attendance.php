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
        'clock_in_photo_path',      // live-camera photo taken at clock-in (private disk)
        'clock_in_recorded_by',     // owner/HR who clocked the staff in manually (no photo)
        'clock_out',
        'clock_out_latitude',
        'clock_out_longitude',
        'clock_out_photo_path',
        'clock_out_recorded_by',
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

    /** Owner / HR who clocked the staff in manually (no photo) */
    public function clockInRecorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'clock_in_recorded_by')->withTrashed();
    }

    /** Owner / HR who clocked the staff out manually */
    public function clockOutRecorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'clock_out_recorded_by')->withTrashed();
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
