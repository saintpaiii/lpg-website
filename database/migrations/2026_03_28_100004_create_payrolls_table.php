<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payrolls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->integer('days_present')->default(0);
            $table->integer('days_late')->default(0);
            $table->integer('days_absent')->default(0);
            $table->integer('days_half_day')->default(0);
            $table->decimal('total_overtime_hours', 8, 2)->default(0.00);
            $table->decimal('daily_rate', 10, 2);
            $table->decimal('basic_pay', 12, 2)->default(0.00);
            $table->decimal('overtime_pay', 12, 2)->default(0.00);
            $table->decimal('late_deduction', 12, 2)->default(0.00);
            $table->decimal('absent_deduction', 12, 2)->default(0.00);
            $table->decimal('gross_pay', 12, 2)->default(0.00);
            $table->decimal('net_pay', 12, 2)->default(0.00);
            $table->enum('status', ['draft', 'released', 'paid'])->default('draft');
            $table->timestamp('released_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['store_id', 'user_id', 'period_start', 'period_end']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payrolls');
    }
};
