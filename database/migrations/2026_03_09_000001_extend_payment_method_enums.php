<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Extend orders.payment_method to support PayMongo methods (card, grab_pay)
        // and make it nullable so online orders can be set after payment confirmation
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay') NULL DEFAULT NULL");

        // Extend invoices.payment_method to match
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya','card','grab_pay') NULL DEFAULT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE orders MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya') NOT NULL DEFAULT 'cash'");
        DB::statement("ALTER TABLE invoices MODIFY COLUMN payment_method ENUM('cash','gcash','bank_transfer','maya') NULL DEFAULT NULL");
    }
};
