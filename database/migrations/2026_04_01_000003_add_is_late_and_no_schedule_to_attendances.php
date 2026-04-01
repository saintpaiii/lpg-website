<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add is_late boolean column
        Schema::table('attendances', function (Blueprint $table) {
            $table->boolean('is_late')->default(false)->after('overtime_hours');
        });

        // Extend the status enum to include 'no_schedule'
        DB::statement("ALTER TABLE `attendances` MODIFY `status` ENUM('present','late','absent','half_day','day_off','undertime','no_schedule') DEFAULT 'absent'");
    }

    public function down(): void
    {
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn('is_late');
        });

        DB::statement("ALTER TABLE `attendances` MODIFY `status` ENUM('present','late','absent','half_day','day_off','undertime') DEFAULT 'absent'");
    }
};
