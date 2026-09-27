<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store-issued discount coupons (a refund resolution option). A coupon is a
     * seller discount on a future order from the same store — no money is held.
     */
    public function up(): void
    {
        Schema::create('store_coupons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('refund_request_id')->nullable()->constrained('refund_requests')->nullOnDelete();
            $table->string('code', 32)->unique();
            $table->decimal('amount', 10, 2);
            $table->enum('status', ['active', 'used', 'expired'])->default('active');
            $table->date('expires_at')->nullable();
            $table->foreignId('used_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'store_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_coupons');
    }
};
