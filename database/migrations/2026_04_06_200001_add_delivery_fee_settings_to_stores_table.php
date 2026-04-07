<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->decimal('base_delivery_fee', 8, 2)->default(45.00)->after('delivery_fee');
            $table->decimal('fee_per_km', 8, 2)->default(10.00)->after('base_delivery_fee');
            $table->unsignedInteger('max_delivery_radius_km')->default(20)->after('fee_per_km');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['base_delivery_fee', 'fee_per_km', 'max_delivery_radius_km']);
        });
    }
};
