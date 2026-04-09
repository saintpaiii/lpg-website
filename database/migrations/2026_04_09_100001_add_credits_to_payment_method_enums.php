<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay','credits','credits_partial') NULL DEFAULT NULL");
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay','credits','credits_partial') NULL DEFAULT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay') NULL DEFAULT NULL");
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay') NULL DEFAULT NULL");
    }
};
