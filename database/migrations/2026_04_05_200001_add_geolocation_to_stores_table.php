<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('barangay');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->unsignedInteger('attendance_radius')->default(500)->after('longitude')
                  ->comment('Allowed clock-in radius in meters');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'attendance_radius']);
        });
    }
};
