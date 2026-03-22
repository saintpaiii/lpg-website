<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Identity verification
            $table->string('valid_id')->nullable()->after('is_active');
            $table->boolean('id_verified')->default(false)->after('valid_id');

            // Store membership (null for platform_admin and customer)
            $table->foreignId('store_id')->nullable()->after('id_verified')
                ->constrained('stores')->nullOnDelete();

            // Role refinement for seller_staff (cashier / warehouse / rider)
            $table->string('sub_role')->nullable()->after('store_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropColumn(['valid_id', 'id_verified', 'store_id', 'sub_role']);
        });
    }
};
