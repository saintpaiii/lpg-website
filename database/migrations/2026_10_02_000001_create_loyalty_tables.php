<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_loyalty', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->enum('tier', ['new', 'regular', 'loyal', 'vip'])->default('new');
            $table->integer('total_orders')->default(0);
            $table->decimal('total_spent', 12, 2)->default(0);
            $table->integer('cancelled_orders')->default(0);
            $table->integer('late_payments')->default(0);
            $table->integer('on_time_payments')->default(0);
            $table->decimal('trust_score', 5, 2)->default(50.00);
            $table->timestamp('tier_achieved_at')->nullable();
            $table->timestamp('last_order_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['user_id', 'store_id']);
        });

        Schema::create('store_loyalty_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();
            $table->boolean('is_enabled')->default(false);
            $table->integer('regular_threshold')->default(8);
            $table->integer('loyal_threshold')->default(15);
            $table->integer('vip_threshold')->default(25);
            $table->integer('new_downpayment_percent')->default(60);
            $table->integer('regular_downpayment_percent')->default(50);
            $table->integer('loyal_downpayment_percent')->default(40);
            $table->integer('vip_downpayment_percent')->default(30);
            $table->decimal('min_trust_score_for_consignment', 5, 2)->default(40.00);
            $table->integer('inactivity_days')->default(90);
            $table->timestamps();
            $table->softDeletes();
        });

        // Guards against counting the same delivery twice (the delivered hook can run more than once)
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('loyalty_recorded_at')->nullable()->after('delivered_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('loyalty_recorded_at');
        });
        Schema::dropIfExists('store_loyalty_settings');
        Schema::dropIfExists('customer_loyalty');
    }
};
