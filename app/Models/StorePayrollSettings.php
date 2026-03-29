<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StorePayrollSettings extends Model
{
    protected $fillable = [
        'store_id',
        'payroll_period',
        'overtime_multiplier',
        'late_deduction_per_day',
    ];

    protected function casts(): array
    {
        return [
            'overtime_multiplier'    => 'decimal:2',
            'late_deduction_per_day' => 'decimal:2',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
