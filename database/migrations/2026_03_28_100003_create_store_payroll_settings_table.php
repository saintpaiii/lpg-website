<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_payroll_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained()->cascadeOnDelete();
            $table->enum('payroll_period', ['weekly', 'bi_weekly', 'monthly'])->default('monthly');
            $table->decimal('overtime_multiplier', 4, 2)->default(1.25);
            $table->decimal('late_deduction_per_day', 10, 2)->default(50.00);
            $table->timestamps();
        });

        // Seed defaults for all existing stores
        $stores = \App\Models\Store::all();
        foreach ($stores as $store) {
            \DB::table('store_payroll_settings')->insertOrIgnore([
                'store_id'              => $store->id,
                'payroll_period'        => 'monthly',
                'overtime_multiplier'   => 1.25,
                'late_deduction_per_day'=> 50.00,
                'created_at'            => now(),
                'updated_at'            => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('store_payroll_settings');
    }
};
