<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Custom staff roles per store (several per person, Off / View only / Full access per module) + work days.
 *
 * Every store gets the 4 starter roles (Cashier, Warehouse, Rider, HR) with hard-coded module levels, and every
 * existing store staff member (users.role = 'seller_staff' only) is attached to the starter role of their sub_role.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->boolean('is_rider')->default(false);
            $table->string('starter_key', 20)->nullable();   // cashier | warehouse | rider | hr
            $table->timestamps();
            $table->unique(['store_id', 'name']);
        });

        Schema::create('store_role_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_role_id')->constrained('store_roles')->cascadeOnDelete();
            $table->string('module', 30);
            $table->string('level', 10);   // view | full
            $table->unique(['store_role_id', 'module']);
        });

        Schema::create('store_role_user', function (Blueprint $table) {
            $table->foreignId('store_role_id')->constrained('store_roles')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->primary(['store_role_id', 'user_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->json('work_days')->nullable()->after('schedule_end');   // ISO weekdays 1=Mon…7=Sun; null = Mon–Sat
        });

        Schema::table('attendances', function (Blueprint $table) {
            $table->boolean('is_extra_day')->default(false)->after('status');   // clocked in on a day off
        });

        $now = now();

        // ── Permissions used by the modules (insert the missing ones; the base catalog normally comes from the seeder)
        $new = config('staff_modules.new_permissions');
        foreach (config('staff_modules.modules') as $module) {
            foreach ($module['permissions'] as $name) {
                if (DB::table('permissions')->where('name', $name)->exists()) {
                    continue;
                }
                [$group, $desc] = $new[$name] ?? [$module['label'], $module['label'] . ': ' . str_replace('_', ' ', explode('.', $name)[1])];
                DB::table('permissions')->insert(['name' => $name, 'group' => $group, 'description' => $desc, 'created_at' => $now, 'updated_at' => $now]);
            }
        }

        // ── Starter roles for every store
        $starters = config('staff_modules.starters');
        $roleIds  = [];   // store_id => starter_key => role id
        foreach (DB::table('stores')->pluck('id') as $storeId) {
            foreach ($starters as $key => $def) {
                $id = DB::table('store_roles')->insertGetId([
                    'store_id' => $storeId, 'name' => $def['name'], 'is_rider' => $def['is_rider'], 'starter_key' => $key,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                foreach ($def['modules'] as $module => $level) {
                    DB::table('store_role_modules')->insert(['store_role_id' => $id, 'module' => $module, 'level' => $level]);
                }
                $roleIds[$storeId][$key] = $id;
            }
        }

        // ── Old role_permissions (global per role) vs the new starter levels — logged, not used
        $modules = config('staff_modules.modules');
        foreach ($starters as $key => $def) {
            $newPerms = [];
            foreach ($def['modules'] as $module => $level) {
                $perms = $modules[$module]['permissions'];
                $newPerms = array_merge($newPerms, $level === 'full' ? $perms : array_filter($perms, fn ($p) => str_ends_with($p, '.view')));
            }
            $old = DB::table('role_permissions')->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
                ->where('role_permissions.role', $key)->pluck('permissions.name')->all();
            $lost   = array_values(array_diff($old, $newPerms));
            $gained = array_values(array_diff($newPerms, $old));
            if ($old && ($lost || $gained)) {
                Log::info("Starter role '{$def['name']}' differs from the old role_permissions of '{$key}'", ['stores' => array_keys($roleIds), 'lost' => $lost, 'gained' => $gained]);
            }
        }

        // ── Attach every store staff member (incl. archived) to the starter role of their sub_role
        $staff = DB::table('users')->where('role', 'seller_staff')->whereNotNull('store_id')->get(['id', 'store_id', 'sub_role']);
        foreach ($staff as $u) {
            if (! isset($roleIds[$u->store_id])) {
                continue;
            }
            $key = isset($starters[$u->sub_role]) ? $u->sub_role : 'cashier';
            DB::table('store_role_user')->insertOrIgnore(['store_role_id' => $roleIds[$u->store_id][$key], 'user_id' => $u->id]);
            if ($u->sub_role !== $key) {
                DB::table('users')->where('id', $u->id)->update(['sub_role' => $key]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('store_role_user');
        Schema::dropIfExists('store_role_modules');
        Schema::dropIfExists('store_roles');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('work_days');
        });
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn('is_extra_day');
        });

        $ids = DB::table('permissions')->whereIn('name', array_keys(config('staff_modules.new_permissions')))->pluck('id');
        DB::table('user_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
