<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Batch delivery + geocoding.
 *
 * Notes on the existing schema:
 *  - orders.delivery_latitude / delivery_longitude already exist (checkout map pin), so
 *    they are not added again.
 *  - rider_locations already exists as a per-delivery GPS history (used by the rider's
 *    "share location" and customer tracking). A rider's single latest position is kept
 *    in a separate rider_current_locations table (one row per rider, upserted).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->unsignedInteger('sequence')->nullable()->after('status');
            $table->uuid('batch_id')->nullable()->after('sequence')->index();
        });

        Schema::create('rider_current_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
        });

        Schema::create('barangay_coordinates', function (Blueprint $table) {
            $table->id();
            $table->string('city', 100);
            $table->string('barangay', 100);
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->unique(['city', 'barangay']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('barangay_coordinates');
        Schema::dropIfExists('rider_current_locations');

        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn(['sequence', 'batch_id']);
        });
    }
};
