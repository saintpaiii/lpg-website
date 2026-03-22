<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('customer_id')
                ->constrained('stores')->nullOnDelete();

            $table->decimal('shipping_fee', 10, 2)->default(0.00)->after('total_amount');
            $table->decimal('platform_fee', 10, 2)->default(0.00)->after('shipping_fee');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropColumn(['store_id', 'shipping_fee', 'platform_fee']);
        });
    }
};
