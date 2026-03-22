<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add new multi-vendor roles while keeping existing ones intact
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

    public function down(): void
    {
        // Revert to original single-distributor roles
        // NOTE: any users with new roles (platform_admin/seller/seller_staff) must be
        // removed or updated before running this down migration.
        DB::statement("
            ALTER TABLE users
            MODIFY COLUMN role ENUM(
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
