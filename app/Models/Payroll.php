<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payroll extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'store_id',
        'user_id',
        'period_start',
        'period_end',
        'days_present',
        'days_late',
        'days_absent',
        'days_half_day',
        'total_overtime_hours',
        'daily_rate',
        'basic_pay',
        'overtime_pay',
        'late_deduction',
        'absent_deduction',
        'undertime_deduction',
        'gross_pay',
        'net_pay',
        'status',
        'released_at',
        'paid_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'period_start'         => 'date',
            'period_end'           => 'date',
            'total_overtime_hours' => 'decimal:2',
            'daily_rate'           => 'decimal:2',
            'basic_pay'            => 'decimal:2',
            'overtime_pay'         => 'decimal:2',
            'late_deduction'       => 'decimal:2',
            'absent_deduction'     => 'decimal:2',
            'undertime_deduction'  => 'decimal:2',
            'gross_pay'            => 'decimal:2',
            'net_pay'              => 'decimal:2',
            'released_at'          => 'datetime',
            'paid_at'              => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
