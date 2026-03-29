<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add 'hr' to the role ENUM on role_permissions
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
                'hr',
                'customer'
            ) NOT NULL
        ");

        // Seed hr role permissions
        $hrPerms = ['dashboard.view', 'orders.view', 'invoices.view', 'invoices.payment', 'reports.view'];

        $permIds = DB::table('permissions')->whereIn('name', $hrPerms)->pluck('id', 'name');
        $now     = now();

        foreach ($hrPerms as $name) {
            if (! isset($permIds[$name])) continue;
            DB::table('role_permissions')->insertOrIgnore([
                'role'          => 'hr',
                'permission_id' => $permIds[$name],
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Remove hr role permissions first
        DB::table('role_permissions')->where('role', 'hr')->delete();

        // Revert ENUM
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
};
