<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Store ownership (nullable to not break existing rows)
            $table->foreignId('store_id')->nullable()->after('id')
                ->constrained('stores')->nullOnDelete();

            // Product image (file path)
            $table->string('image')->nullable()->after('description');

            // Multi-vendor pricing
            // refill_price  = price for refilling an existing cylinder
            // purchase_price = price for buying a brand-new cylinder
            $table->decimal('refill_price', 10, 2)->nullable()->after('cost_price');
            $table->decimal('purchase_price', 10, 2)->nullable()->after('refill_price');

            // Human-readable weight string (e.g. "11kg", "22kg")
            // Complements the existing numeric weight_kg column
            $table->string('weight')->nullable()->after('weight_kg');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropColumn(['store_id', 'image', 'refill_price', 'purchase_price', 'weight']);
        });
    }
};
