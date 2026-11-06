<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acknowledgement receipts (RR 7-2024 "supplementary document"): one per payment received, in the store's own
 * "{prefix}-AR-000001" series. Separate from the invoice; never reversed (refunds / credit memos are out of scope).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_number', 30)->unique();
            $table->foreignId('store_id')->constrained();
            $table->foreignId('order_id')->constrained();
            $table->foreignId('customer_id')->nullable()->constrained();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('payment_method', 30)->nullable();
            $table->string('reference', 100)->nullable();   // NOT unique: one PayMongo payment can pay several stores' orders
            $table->string('source', 20);                    // online | cash_on_delivery | cash_at_store | seller_recorded | walk_in
            $table->string('kind', 20);                      // full | down_payment | balance | partial
            $table->decimal('balance_after', 10, 2);
            $table->timestamp('received_at');
            $table->timestamp('emailed_at')->nullable();
            $table->timestamps();

            $table->index('order_id');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->unsignedInteger('receipt_next_number')->default(1);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_receipts');

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('receipt_next_number');
        });
    }
};
