<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Customer Reports" permission for existing databases (fresh installs get it from DemoSeeder too).
 * Store owners always pass (RequirePermission); cashiers get it by default.
 * Warehouse / HR / rider staff do not.
 */
return new class extends Migration
{
    private const PERMS = [
        'customer_reports.manage' => 'View and reply to reports from customers and riders',
    ];

    private const ROLES = ['platform_admin', 'admin', 'seller', 'cashier'];

    public function up(): void
    {
        $now = now();
        foreach (self::PERMS as $name => $desc) {
            DB::table('permissions')->insertOrIgnore([
                'name' => $name, 'group' => 'Customer Reports', 'description' => $desc,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        $ids = DB::table('permissions')->whereIn('name', array_keys(self::PERMS))->pluck('id');
        foreach (self::ROLES as $role) {
            foreach ($ids as $id) {
                if (! DB::table('role_permissions')->where('role', $role)->where('permission_id', $id)->exists()) {
                    DB::table('role_permissions')->insert([
                        'role' => $role, 'permission_id' => $id, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('name', array_keys(self::PERMS))->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
