<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StorePayrollSettings extends Model
{
    /** Defaults for a store that has never saved payroll settings. */
    public const DEFAULTS = [
        'payroll_period'         => 'monthly',
        'overtime_multiplier'    => 1.25,     // PH Labor Code overtime premium
        'late_deduction_per_day' => 0,        // no fixed late deduction (late minutes are unpaid)
        'default_hourly_rate'    => 62.50,
        'meal_break_paid'        => false,
        'meal_break_minutes'     => 60,
        'meal_break_after_hours' => 5,
    ];

    protected $fillable = [
        'store_id',
        'payroll_period',
        'overtime_multiplier',
        'late_deduction_per_day',
        'default_hourly_rate',
        'meal_break_paid',
        'meal_break_minutes',
        'meal_break_after_hours',
    ];

    protected function casts(): array
    {
        return [
            'overtime_multiplier'    => 'decimal:2',
            'late_deduction_per_day' => 'decimal:2',
            'default_hourly_rate'    => 'decimal:2',
            'meal_break_paid'        => 'boolean',
            'meal_break_minutes'     => 'integer',
            'meal_break_after_hours' => 'decimal:2',
        ];
    }

    /** The store's settings, created with the defaults the first time. */
    public static function forStore(int $storeId): self
    {
        return static::firstOrCreate(['store_id' => $storeId], self::DEFAULTS);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
