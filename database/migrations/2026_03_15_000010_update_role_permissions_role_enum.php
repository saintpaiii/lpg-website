<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE role_permissions
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
            ) NOT NULL
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE role_permissions
            MODIFY COLUMN role ENUM(
                'admin',
                'manager',
                'cashier',
                'warehouse',
                'rider',
                'customer'
            ) NOT NULL
        ");
    }
};
