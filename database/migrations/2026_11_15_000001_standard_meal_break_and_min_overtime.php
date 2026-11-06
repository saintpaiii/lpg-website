<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Data only — every store follows the standard rule:
 *  - 60-minute UNPAID meal break (Labor Code Art. 85), subtracted when the paid shift window is 5 hours or more;
 *  - overtime multiplier never below 1.25 (Art. 87).
 * The columns stay (the calculator no longer reads the meal_break ones).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('store_payroll_settings')->update([
            'meal_break_paid'        => 0,
            'meal_break_minutes'     => 60,
            'meal_break_after_hours' => 5,
        ]);

        DB::table('store_payroll_settings')
            ->where('overtime_multiplier', '<', 1.25)
            ->update(['overtime_multiplier' => 1.25]);
    }

    public function down(): void
    {
        // Nothing to undo — the old per-store values are not kept
    }
};
