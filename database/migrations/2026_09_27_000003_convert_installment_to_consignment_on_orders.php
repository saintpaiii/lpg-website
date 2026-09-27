<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Widen first so existing 'installment' rows can be renamed without data loss
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','installment','consignment','cod') NOT NULL DEFAULT 'full'");
        DB::table('orders')->where('payment_mode', 'installment')->update(['payment_mode' => 'consignment']);
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','consignment','cod') NOT NULL DEFAULT 'full'");

        Schema::table('orders', function (Blueprint $table) {
            $table->date('balance_due_date')->nullable()->after('remaining_balance');
            $table->timestamp('balance_reminder_sent_at')->nullable()->after('balance_due_date');
            $table->timestamp('balance_overdue_notified_at')->nullable()->after('balance_reminder_sent_at');
            $table->decimal('discount_amount', 10, 2)->default(0)->after('platform_fee');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['balance_due_date', 'balance_reminder_sent_at', 'balance_overdue_notified_at', 'discount_amount']);
        });

        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','installment','consignment','cod') NOT NULL DEFAULT 'full'");
        DB::table('orders')->where('payment_mode', 'consignment')->update(['payment_mode' => 'installment']);
        DB::table('orders')->where('payment_mode', 'cod')->update(['payment_mode' => 'full']);
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','installment') NOT NULL DEFAULT 'full'");
    }
};
