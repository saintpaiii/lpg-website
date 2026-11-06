<?php

namespace App\Services;

use App\Models\Store;
use App\Models\StoreRole;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Store staff roles: the 4 starter roles, saving a role, and assigning roles to a person. */
class StoreRoleService
{
    /** Create the missing starter roles (Cashier, Warehouse, Rider, HR) of a store. Idempotent. */
    public static function seedStarters(Store|int $store): void
    {
        $storeId = $store instanceof Store ? $store->id : $store;
        $have    = StoreRole::where('store_id', $storeId)->whereNotNull('starter_key')->pluck('starter_key')->all();

        foreach (config('staff_modules.starters') as $key => $def) {
            if (in_array($key, $have, true)) {
                continue;
            }
            // A custom role may already use the starter's name (e.g. a store made "Cashier" itself)
            $name = $def['name'];
            if (StoreRole::where('store_id', $storeId)->where('name', $name)->exists()) {
                $name .= ' (starter)';
            }
            self::save(new StoreRole(['store_id' => $storeId, 'starter_key' => $key]), $name, $def['is_rider'], $def['modules']);
        }
    }

    /** Can this store create / edit / delete roles (Pro plan and up, or the trial)? */
    public static function canEdit(Store $store): bool
    {
        return SubscriptionService::hasFeature($store, 'custom_roles');
    }

    /**
     * Save a role's name, rider flag and module levels (module => view|full; anything else = Off).
     * When is_rider changes, every member's derived sub_role is re-synced.
     */
    public static function save(StoreRole $role, string $name, bool $isRider, array $modules): StoreRole
    {
        $known = array_keys(StaffAccess::modules());

        DB::transaction(function () use ($role, $name, $isRider, $modules, $known) {
            $riderChanged = $role->exists && $role->is_rider !== $isRider;
            $role->fill(['name' => trim($name), 'is_rider' => $isRider])->save();

            $role->modules()->delete();
            foreach ($modules as $module => $level) {
                if (! in_array($module, $known, true) || ! in_array($level, StaffAccess::LEVELS, true)) {
                    continue;
                }
                // View-only modules (Dashboard, Loyal customers list) have nothing to do with Full access
                if (($level === 'full') && (StaffAccess::modules()[$module]['view_only'] ?? false)) {
                    $level = 'view';
                }
                $role->modules()->create(['module' => $module, 'level' => $level]);
            }

            if ($riderChanged) {
                foreach ($role->users()->withTrashed()->get() as $u) {
                    StaffAccess::syncSubRole($u);
                }
            }
        });

        // Members' sidebar badges depend on what they can open
        foreach ($role->users()->withTrashed()->pluck('users.id') as $id) {
            \Illuminate\Support\Facades\Cache::forget(SidebarBadgeService::key((int) $id));
        }

        StaffAccess::forget();

        return $role->load('modules');
    }

    /** Give a person exactly these roles (ids of their store) and re-derive sub_role. */
    public static function assign(User $u, array $roleIds): void
    {
        $ids = StoreRole::where('store_id', $u->store_id)->whereIn('id', $roleIds)->pluck('id')->all();
        DB::table('store_role_user')->where('user_id', $u->id)->delete();
        foreach ($ids as $id) {
            DB::table('store_role_user')->insert(['store_role_id' => $id, 'user_id' => $u->id]);
        }
        StaffAccess::syncSubRole($u);
    }

    /** Roles of a store for the staff page (with member counts and levels). */
    public static function listFor(Store $store): array
    {
        return StoreRole::where('store_id', $store->id)
            ->with('modules')
            // Archived staff keep their roles (they can be restored), so they count as members too
            ->withCount(['users as members_count' => fn ($q) => $q->withTrashed()])
            ->orderByRaw('starter_key IS NULL')   // starters first
            ->orderBy('id')
            ->get()
            ->map(fn (StoreRole $r) => [
                'id'          => $r->id,
                'name'        => $r->name,
                'is_rider'    => $r->is_rider,
                'is_starter'  => $r->starter_key !== null,
                'starter_key' => $r->starter_key,
                'members'     => (int) $r->members_count,
                'modules'     => (object) $r->levels(),
            ])->all();
    }
}
