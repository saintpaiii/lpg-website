<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->boolean('allow_cod')->default(true)->after('max_delivery_radius_km');
            $table->boolean('allow_consignment')->default(true)->after('allow_cod');
            $table->unsignedTinyInteger('min_down_payment_percent')->default(50)->after('allow_consignment');
            $table->unsignedSmallInteger('consignment_due_days')->default(7)->after('min_down_payment_percent');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['allow_cod', 'allow_consignment', 'min_down_payment_percent', 'consignment_due_days']);
        });
    }
};
