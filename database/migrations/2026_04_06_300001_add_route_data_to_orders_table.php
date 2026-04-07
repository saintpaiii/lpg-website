<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('delivery_distance_km', 8, 2)->nullable()->after('delivery_longitude');
            $table->unsignedSmallInteger('estimated_delivery_minutes')->nullable()->after('delivery_distance_km');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_distance_km', 'estimated_delivery_minutes']);
        });
    }
};
