<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * J6
 *  - vehicles.tank_limits: max tanks per gas size per trip, e.g. {"2.7": 10, "11": 4, "22": 2, "50": 1}
 *    (null / a missing size = no per-size limit — only total kg + total tanks apply; existing vehicles stay null)
 *  - vehicle_capacity_misses: orders refused at checkout (or switched to pick-up) because no vehicle could carry them —
 *    the seller DSS "Fleet" card counts them
 *  - conversation_messages: latitude / longitude / location_label for "📍 Share location"
 *  - refund_requests: reason 'overpayment' + payment_id (one refund per PayMongo payment — idempotent)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->json('tank_limits')->nullable()->after('max_tanks');
        });

        Schema::create('vehicle_capacity_misses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('kg', 10, 2);
            $table->unsignedInteger('tanks');
            $table->json('by_size')->nullable();
            $table->string('reason', 40);            // too_heavy | too_many_of_size | switched_to_pickup
            $table->timestamp('created_at')->useCurrent();
            $table->index(['store_id', 'created_at']);
        });

        Schema::table('conversation_messages', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('attachment_path');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->string('location_label', 255)->nullable()->after('longitude');
        });

        Schema::table('refund_requests', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->after('order_id')->constrained('payments')->nullOnDelete();
            $table->unique('payment_id');
        });
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE refund_requests MODIFY COLUMN reason ENUM('damaged_product','leaking_tank','wrong_product','missing_items','quality_issue','other','order_cancelled','overpayment') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::table('refund_requests')->where('reason', 'overpayment')->update(['reason' => 'other']);
            DB::statement("ALTER TABLE refund_requests MODIFY COLUMN reason ENUM('damaged_product','leaking_tank','wrong_product','missing_items','quality_issue','other','order_cancelled') NOT NULL");
        }
        Schema::table('refund_requests', function (Blueprint $table) {
            // MySQL: the foreign key uses the unique index — drop the key first, then the index, then the column
            $table->dropForeign(['payment_id']);
            $table->dropUnique(['payment_id']);
            $table->dropColumn('payment_id');
        });

        Schema::table('conversation_messages', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'location_label']);
        });

        Schema::dropIfExists('vehicle_capacity_misses');

        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('tank_limits');
        });
    }
};
