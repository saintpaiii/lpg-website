<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('customer_id')
                ->constrained('stores')->nullOnDelete();

            // Commission amount the platform earns from this invoice
            $table->decimal('platform_commission', 10, 2)->default(0.00)->after('total_amount');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropColumn(['store_id', 'platform_commission']);
        });
    }
};
