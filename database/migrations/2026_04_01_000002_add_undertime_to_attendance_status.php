<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL: modify enum to add 'undertime'
        DB::statement("ALTER TABLE attendances MODIFY COLUMN status ENUM('present','late','absent','half_day','day_off','undertime') NOT NULL DEFAULT 'absent'");
    }

    public function down(): void
    {
        // Revert any 'undertime' records to 'absent' before removing the value
        DB::table('attendances')->where('status', 'undertime')->update(['status' => 'absent']);
        DB::statement("ALTER TABLE attendances MODIFY COLUMN status ENUM('present','late','absent','half_day','day_off') NOT NULL DEFAULT 'absent'");
    }
};
