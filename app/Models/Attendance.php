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
        'clock_out',
        'status',
        'overtime_hours',
        'is_late',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'date'           => 'date',
            'clock_in'       => 'datetime',
            'clock_out'      => 'datetime',
            'overtime_hours' => 'decimal:2',
            'is_late'        => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
