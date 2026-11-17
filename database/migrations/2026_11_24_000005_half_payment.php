<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * J5 — Half payment: 50% online now, the rest online before delivery or in cash to the rider.
 *  - stores.allow_half_payment (off by default; the seller turns it on in Settings)
 *  - orders.payment_mode gains 'half' (the old values stay: full / consignment / cod —
 *    'installment' was already renamed to 'consignment' by 2026_09_27_000003)
 *  - refund_requests.reason gains 'order_cancelled' (automatic refund when a paid order is cancelled)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('allow_half_payment')->default(false)->after('allow_consignment');
        });

        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','consignment','cod','half') NOT NULL DEFAULT 'full'");

        DB::statement("ALTER TABLE refund_requests MODIFY COLUMN reason ENUM('damaged_product','leaking_tank','wrong_product','missing_items','quality_issue','other','order_cancelled') NOT NULL");
    }

    public function down(): void
    {
        DB::table('refund_requests')->where('reason', 'order_cancelled')->update(['reason' => 'other']);
        DB::statement("ALTER TABLE refund_requests MODIFY COLUMN reason ENUM('damaged_product','leaking_tank','wrong_product','missing_items','quality_issue','other') NOT NULL");

        // A half-payment order becomes a consignment order (same down payment / remaining balance columns)
        DB::table('orders')->where('payment_mode', 'half')->update(['payment_mode' => 'consignment']);
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_mode ENUM('full','consignment','cod') NOT NULL DEFAULT 'full'");

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('allow_half_payment');
        });
    }
};
