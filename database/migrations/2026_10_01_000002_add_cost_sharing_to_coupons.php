<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            // Platform coupons: how much of each discount the platform covers
            $table->unsignedTinyInteger('admin_share_percent')->default(50)->after('is_active');
            // Commission rate charged to participating stores on promo orders (null = store's normal rate)
            $table->decimal('seller_commission_during_promo', 5, 2)->nullable()->after('admin_share_percent');
            $table->boolean('featured_boost')->default(true)->after('seller_commission_during_promo');
        });

        // Store coupons are funded entirely by the seller
        \Illuminate\Support\Facades\DB::table('coupons')->where('type', 'store')
            ->update(['admin_share_percent' => 0, 'featured_boost' => false]);

        Schema::table('coupon_uses', function (Blueprint $table) {
            $table->decimal('admin_absorbed', 10, 2)->default(0)->after('discount_applied');
            $table->decimal('seller_absorbed', 10, 2)->default(0)->after('admin_absorbed');
            // Commission rate agreed for this order (snapshot, so later coupon edits don't change it)
            $table->decimal('commission_rate', 5, 2)->nullable()->after('seller_absorbed');
            // One checkout may create several orders (one per store) but counts as one use
            $table->uuid('checkout_ref')->nullable()->after('commission_rate')->index();
        });

        Schema::create('coupon_store_exclusions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained('coupons')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->timestamp('excluded_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['coupon_id', 'store_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coupon_store_exclusions');

        Schema::table('coupon_uses', function (Blueprint $table) {
            $table->dropColumn(['admin_absorbed', 'seller_absorbed', 'commission_rate', 'checkout_ref']);
        });

        Schema::table('coupons', function (Blueprint $table) {
            $table->dropColumn(['admin_share_percent', 'seller_commission_during_promo', 'featured_boost']);
        });
    }
};
