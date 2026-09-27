<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('refund_requests', function (Blueprint $table) {
            $table->enum('preferred_resolution', ['replacement', 'money_refund', 'store_discount'])->nullable()->after('reason');
            $table->enum('seller_resolution', ['replacement', 'money_refund', 'store_discount'])->nullable()->after('status');
            $table->text('seller_notes')->nullable()->after('seller_resolution');
            $table->string('refund_reference', 100)->nullable()->after('seller_notes');
            $table->foreignId('replacement_order_id')->nullable()->after('refund_reference')->constrained('orders')->nullOnDelete();
            $table->foreignId('replacement_delivery_id')->nullable()->after('replacement_order_id')->constrained('deliveries')->nullOnDelete();
            $table->enum('return_method', ['rider_pickup', 'customer_dropoff', 'no_return'])->nullable()->after('replacement_delivery_id');
            $table->timestamp('seller_responded_at')->nullable()->after('return_method');
            $table->boolean('escalated_to_admin')->default(false)->after('seller_responded_at');
            $table->text('escalation_reason')->nullable()->after('escalated_to_admin');
            $table->timestamp('escalated_at')->nullable()->after('escalation_reason');
            $table->enum('admin_decision', ['favor_customer', 'favor_seller'])->nullable()->after('escalated_at');
            $table->timestamp('admin_decided_at')->nullable()->after('admin_decision');
        });
    }

    public function down(): void
    {
        Schema::table('refund_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('replacement_order_id');
            $table->dropConstrainedForeignId('replacement_delivery_id');
            $table->dropColumn([
                'preferred_resolution', 'seller_resolution', 'seller_notes', 'refund_reference',
                'return_method', 'seller_responded_at', 'escalated_to_admin', 'escalation_reason',
                'escalated_at', 'admin_decision', 'admin_decided_at',
            ]);
        });
    }
};
