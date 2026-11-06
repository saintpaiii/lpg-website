<?php

namespace App\Services;

use App\Models\Store;
use App\Models\StoreRole;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * What a store staff member (users.role = 'seller_staff') may do — the ONE access check of the store portal.
 *
 * Access = the highest level per module across the person's store roles (config/staff_modules.php), then the
 * per-person "extra access" overrides (user_permissions: granted adds, revoked removes a single permission).
 * The store owner (role 'seller') is not handled here: the owner always has full access.
 *
 * Memoized per request (request attributes) and per user id; call forget() after changing roles, assignments or
 * overrides in the same request.
 */
class StaffAccess
{
    public const LEVELS = ['view', 'full'];

    /** @return array<string, array> module key => definition */
    public static function modules(): array
    {
        return config('staff_modules.modules');
    }

    /** Permissions a module level gives: 'view' = its *.view permissions, 'full' = all of them. */
    public static function permissionsForLevel(string $module, ?string $level): array
    {
        $perms = self::modules()[$module]['permissions'] ?? [];

        return match ($level) {
            'full'  => $perms,
            'view'  => array_values(array_filter($perms, fn ($p) => str_ends_with($p, '.view'))),
            default => [],
        };
    }

    /** All permissions of the store-portal modules (what "extra access" may grant / revoke). */
    public static function allModulePermissions(): array
    {
        return array_values(array_unique(array_merge(...array_column(self::modules(), 'permissions'))));
    }

    /** Per-request memo for one user. */
    private static function memo(User $u): array
    {
        $bag = request()->attributes;
        $key = "staff_access.{$u->id}";
        if (! $bag->has($key)) {
            $roles = StoreRole::query()
                ->join('store_role_user', 'store_role_user.store_role_id', '=', 'store_roles.id')
                ->where('store_role_user.user_id', $u->id)
                ->where('store_roles.store_id', $u->store_id)
                ->orderBy('store_roles.id')
                ->select('store_roles.*')
                ->with('modules')
                ->get();

            $rolePerms = [];
            foreach ($roles as $role) {
                foreach ($role->modules as $m) {
                    $rolePerms = array_merge($rolePerms, self::permissionsForLevel($m->module, $m->level));
                }
            }
            $rolePerms = array_values(array_unique($rolePerms));

            $overrides = UserPermission::query()
                ->join('permissions', 'permissions.id', '=', 'user_permissions.permission_id')
                ->where('user_permissions.user_id', $u->id)
                ->get(['permissions.name', 'user_permissions.granted']);
            $granted = $overrides->where('granted', true)->pluck('name')->all();
            $revoked = $overrides->where('granted', false)->pluck('name')->all();

            $bag->set($key, [
                'roles'      => $roles,
                'role_perms' => $rolePerms,
                'perms'      => array_values(array_diff(array_unique(array_merge($rolePerms, $granted)), $revoked)),
            ]);
        }

        return $bag->get($key);
    }

    public static function forget(?User $u = null): void
    {
        $bag = request()->attributes;
        if ($u) {
            $bag->remove("staff_access.{$u->id}");
            return;
        }
        foreach (array_keys($bag->all()) as $k) {
            if (str_starts_with((string) $k, 'staff_access.')) {
                $bag->remove($k);
            }
        }
    }

    /** @return Collection<int, StoreRole> the person's roles in their store (with modules), oldest first */
    public static function roles(User $u): Collection
    {
        return self::memo($u)['roles'];
    }

    /** Permissions from the roles only (no per-person overrides). */
    public static function rolePermissions(User $u): array
    {
        return self::memo($u)['role_perms'];
    }

    /** Roles + per-person grants − per-person revokes. */
    public static function permissionsFor(User $u): array
    {
        return self::memo($u)['perms'];
    }

    public static function can(User $u, string $permission): bool
    {
        return in_array($permission, self::permissionsFor($u), true);
    }

    /** 'full' (any non-view permission of the module), 'view' (only view permissions) or null. */
    public static function levelFor(User $u, string $module): ?string
    {
        $mine = array_intersect(self::modules()[$module]['permissions'] ?? [], self::permissionsFor($u));
        if (! $mine) {
            return null;
        }
        foreach ($mine as $p) {
            if (! str_ends_with($p, '.view')) {
                return 'full';
            }
        }

        return 'view';
    }

    /** Any of the person's roles delivers orders. */
    public static function isRider(User $u): bool
    {
        return self::roles($u)->contains(fn (StoreRole $r) => $r->is_rider);
    }

    /** Any role that is not a rider role → may use the store portal (riders: "Switch to Store Portal"). */
    public static function hasStorePortalRoles(User $u): bool
    {
        return self::roles($u)->contains(fn (StoreRole $r) => ! $r->is_rider);
    }

    public static function hasStarter(User $u, string $key): bool
    {
        return self::roles($u)->contains(fn (StoreRole $r) => $r->starter_key === $key);
    }

    /** @return string[] */
    public static function roleNames(User $u): array
    {
        return self::roles($u)->pluck('name')->all();
    }

    /** Role names of many staff in ONE query: user id => names. */
    public static function roleNamesFor(iterable $users): array
    {
        $ids = collect($users)->pluck('id')->all();
        if (! $ids) {
            return [];
        }

        return \Illuminate\Support\Facades\DB::table('store_role_user')
            ->join('store_roles', 'store_roles.id', '=', 'store_role_user.store_role_id')
            ->whereIn('store_role_user.user_id', $ids)
            ->orderBy('store_roles.id')
            ->get(['store_role_user.user_id', 'store_roles.name', 'store_roles.id'])
            ->groupBy('user_id')
            ->map(fn ($rows) => $rows->pluck('name')->all())
            ->all();
    }

    /**
     * users.sub_role is DERIVED from the roles: 'rider' when any role delivers orders, else the starter key of the
     * first starter role, else 'custom'. Saved through Eloquent so the User::saved hooks run (store visibility).
     */
    public static function syncSubRole(User $u): void
    {
        self::forget($u);
        $roles = self::roles($u);
        $sub = $roles->contains(fn (StoreRole $r) => $r->is_rider)
            ? 'rider'
            : ($roles->first(fn (StoreRole $r) => $r->starter_key !== null)?->starter_key ?? 'custom');

        if ($u->sub_role !== $sub) {
            $u->sub_role = $sub;
            $u->save();
        }
        Store::forgetVisibilityCache($u->store_id);
        Cache::forget(SidebarBadgeService::key($u->id));
    }

    /** First page a staff member can open (rider → rider app, unless $storePortal: their first store-portal page). */
    public static function homeUrl(User $u, bool $storePortal = false): string
    {
        if ($u->sub_role === 'rider' && ! $storePortal) {
            return '/rider/deliveries';
        }
        $store = $u->store_id ? Store::find($u->store_id) : null;
        foreach (config('staff_modules.home_order') as $module => $url) {
            if ($module === 'payroll' && (! $store || ! SubscriptionService::hasFeature($store, 'payroll'))) {
                continue;
            }
            if (self::levelFor($u, $module)) {
                return $url;
            }
        }

        // Riders keep their attendance in the rider app; others have My Attendance in the store portal
        return $u->sub_role === 'rider' ? '/seller/my-documents' : '/seller/my-attendance';
    }
}
