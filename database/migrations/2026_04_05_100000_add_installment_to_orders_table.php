<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->enum('payment_mode', ['full', 'installment'])->default('full')->after('payment_status');
            $table->decimal('down_payment_amount', 10, 2)->nullable()->after('payment_mode');
            $table->decimal('remaining_balance', 10, 2)->nullable()->after('down_payment_amount');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['payment_mode', 'down_payment_amount', 'remaining_balance']);
        });
    }
};
