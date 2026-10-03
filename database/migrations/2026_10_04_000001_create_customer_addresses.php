<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Saved delivery addresses (Home, Office, …) per customer user, plus a snapshot of the
 * chosen delivery address on each order — so the rider sees the address the pin belongs
 * to, not whatever the customer's profile says today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 50)->default('Home');
            $table->string('address_line');
            $table->string('barangay')->nullable();
            $table->string('city')->nullable();
            $table->string('province')->default('Cavite');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'is_default']);
        });

        Schema::table('orders', function (Blueprint $table) {
            // Null on older orders → fall back to the customer's profile address
            $table->string('delivery_address', 500)->nullable()->after('delivery_longitude');
            $table->string('delivery_barangay')->nullable()->after('delivery_address');
            $table->string('delivery_city')->nullable()->after('delivery_barangay');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_address', 'delivery_barangay', 'delivery_city']);
        });
        Schema::dropIfExists('customer_addresses');
    }
};
