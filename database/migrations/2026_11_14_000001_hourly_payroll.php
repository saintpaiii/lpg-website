<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hourly payroll (Prompt D).
 *
 * - Each store role has an hourly rate (a person with several roles gets the highest); a personal hourly rate wins.
 * - Store payroll settings: default hourly rate + meal break rule (paid / unpaid, minutes, after N hours).
 * - Payrolls keep a day-by-day snapshot (breakdown) and the whole hours paid. Old rows stay pay_basis 'daily'.
 *
 * Existing daily rates are converted: hourly = daily / 8 (starter roles from store_pay_rates, personal overrides).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_roles', function (Blueprint $table) {
            $table->decimal('hourly_rate', 8, 2)->nullable()->after('starter_key');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->decimal('hourly_rate_override', 8, 2)->nullable()->after('daily_rate_override');
        });

        Schema::table('store_payroll_settings', function (Blueprint $table) {
            $table->decimal('default_hourly_rate', 8, 2)->default(62.50);
            $table->boolean('meal_break_paid')->default(false);
            $table->unsignedSmallInteger('meal_break_minutes')->default(60);
            $table->decimal('meal_break_after_hours', 4, 2)->default(5);
        });

        Schema::table('payrolls', function (Blueprint $table) {
            $table->decimal('daily_rate', 10, 2)->nullable()->change();
            $table->decimal('hourly_rate', 8, 2)->nullable()->after('daily_rate');
            $table->unsignedSmallInteger('regular_hours')->default(0)->after('hourly_rate');
            $table->unsignedSmallInteger('overtime_hours_paid')->default(0)->after('regular_hours');
            $table->json('breakdown')->nullable();
            $table->string('pay_basis', 10)->default('daily');
        });

        // ── Data: daily → hourly ────────────────────────────────────────────────
        $rates = DB::table('store_pay_rates')->get(['store_id', 'sub_role', 'daily_rate']);
        foreach ($rates as $r) {
            DB::table('store_roles')
                ->where('store_id', $r->store_id)
                ->where('starter_key', $r->sub_role)
                ->update(['hourly_rate' => round((float) $r->daily_rate / 8, 2)]);
        }

        DB::table('users')->whereNotNull('daily_rate_override')->update([
            'hourly_rate_override' => DB::raw('ROUND(daily_rate_override / 8, 2)'),
        ]);

        // No fixed late deduction any more (late minutes are simply unpaid)
        DB::table('store_payroll_settings')->update(['default_hourly_rate' => 62.50, 'late_deduction_per_day' => 0]);
    }

    public function down(): void
    {
        Schema::table('payrolls', function (Blueprint $table) {
            $table->dropColumn(['hourly_rate', 'regular_hours', 'overtime_hours_paid', 'breakdown', 'pay_basis']);
        });
        if (! DB::table('payrolls')->whereNull('daily_rate')->exists()) {
            Schema::table('payrolls', function (Blueprint $table) {
                $table->decimal('daily_rate', 10, 2)->nullable(false)->change();
            });
        }

        Schema::table('store_payroll_settings', function (Blueprint $table) {
            $table->dropColumn(['default_hourly_rate', 'meal_break_paid', 'meal_break_minutes', 'meal_break_after_hours']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('hourly_rate_override');
        });

        Schema::table('store_roles', function (Blueprint $table) {
            $table->dropColumn('hourly_rate');
        });
    }
};
