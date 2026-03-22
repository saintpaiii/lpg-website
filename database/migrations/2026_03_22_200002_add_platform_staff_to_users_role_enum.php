<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM(
                'platform_admin',
                'platform_staff',
                'seller',
                'seller_staff',
                'admin',
                'manager',
                'cashier',
                'warehouse',
                'rider',
                'customer'
            ) NOT NULL DEFAULT 'customer'
        ");
    }

    public function down(): void
    {
        // Update any platform_staff users back to customer before reverting
        DB::statement("UPDATE users SET role = 'customer' WHERE role = 'platform_staff'");

        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM(
                'platform_admin',
                'seller',
                'seller_staff',
                'admin',
                'manager',
                'cashier',
                'warehouse',
                'rider',
                'customer'
            ) NOT NULL DEFAULT 'customer'
        ");
    }
};
