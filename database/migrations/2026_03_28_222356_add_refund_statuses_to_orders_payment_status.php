<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('unpaid','paid','partial','to_refund','refunded') NOT NULL DEFAULT 'unpaid'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE orders MODIFY payment_status ENUM('unpaid','paid','partial') NOT NULL DEFAULT 'unpaid'");
    }
};
