<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * J1 (additive only):
 * - users.suffix — Jr., Sr., II … shown after the last name
 * - users.can_shop — false for seller-only accounts made on /seller/register (no Customer Portal). Existing users keep true.
 * - attendances clock-in / clock-out live-camera photos (private disk) and who recorded a manual clock-in / out
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('suffix', 10)->nullable()->after('last_name');
            $table->boolean('can_shop')->default(true)->after('role');
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->string('clock_in_photo_path')->nullable()->after('clock_in_longitude');
            $table->string('clock_out_photo_path')->nullable()->after('clock_out_longitude');
            $table->foreignId('clock_in_recorded_by')->nullable()->after('clock_in_photo_path')->constrained('users')->nullOnDelete();
            $table->foreignId('clock_out_recorded_by')->nullable()->after('clock_out_photo_path')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropConstrainedForeignId('clock_in_recorded_by');
            $table->dropConstrainedForeignId('clock_out_recorded_by');
            $table->dropColumn(['clock_in_photo_path', 'clock_out_photo_path']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['suffix', 'can_shop']);
        });
    }
};
