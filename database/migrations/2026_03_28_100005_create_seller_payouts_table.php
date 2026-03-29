<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seller_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('total_sales', 14, 2)->default(0.00);
            $table->decimal('commission_rate', 5, 2)->default(5.00);
            $table->decimal('commission_amount', 12, 2)->default(0.00);
            $table->decimal('payout_amount', 12, 2)->default(0.00);
            $table->enum('status', ['pending', 'released'])->default('pending');
            $table->timestamp('released_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seller_payouts');
    }
};
