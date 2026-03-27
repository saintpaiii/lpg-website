<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('cancellation_reason')->nullable()->after('notes');
            $table->text('cancellation_notes')->nullable()->after('cancellation_reason');
            $table->string('cancelled_by')->nullable()->after('cancellation_notes'); // 'customer' | 'seller'
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by');
        });

        // Extend invoice payment_status enum to include 'voided'
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_status ENUM('unpaid','paid','partial','voided') NOT NULL DEFAULT 'unpaid'");
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['cancellation_reason', 'cancellation_notes', 'cancelled_by', 'cancelled_at']);
        });

        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_status ENUM('unpaid','paid','partial') NOT NULL DEFAULT 'unpaid'");
    }
};
