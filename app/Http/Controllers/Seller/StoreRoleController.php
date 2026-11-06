<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\StoreRole;
use App\Services\StaffAccess;
use App\Services\StoreRoleService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Store staff roles — owner only (seller_owner) and a Pro feature (plan.feature:custom_roles).
 * The 4 starter roles can be edited on Pro too, but never deleted.
 */
class StoreRoleController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        $data  = $this->validated($request, $store->id);

        $role = StoreRoleService::save(new StoreRole(['store_id' => $store->id]), $data['name'], (bool) ($data['is_rider'] ?? false), $data['modules'] ?? []);

        return back()->with('success', "Role \"{$role->name}\" created.");
    }

    public function update(Request $request, StoreRole $role): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($role->store_id === $store->id, 403);
        $data = $this->validated($request, $store->id, $role->id);

        StoreRoleService::save($role, $data['name'], (bool) ($data['is_rider'] ?? false), $data['modules'] ?? []);

        return back()->with('success', "Role \"{$role->name}\" saved.");
    }

    public function destroy(Request $request, StoreRole $role): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($role->store_id === $store->id, 403);

        if ($role->starter_key !== null) {
            return back()->with('error', 'Starter roles can be edited but not deleted.');
        }
        // Archived staff keep their roles (they can be restored), so they count too
        $members = $role->users()->withTrashed()->count();
        if ($members > 0) {
            return back()->with('error', "Remove it from {$members} staff first.");
        }

        $name = $role->name;
        $role->delete();

        return back()->with('success', "Role \"{$name}\" deleted.");
    }

    private function validated(Request $request, int $storeId, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'name'      => ['required', 'string', 'max:40'],
            'is_rider'  => ['boolean'],
            'modules'   => ['nullable', 'array'],
            'modules.*' => ['nullable', 'in:off,view,full'],
        ], [
            'modules.*.in' => 'Choose Off, View only or Full access.',
        ]);

        // Unique per store, ignoring upper / lower case
        $name  = trim($data['name']);
        $taken = DB::table('store_roles')->where('store_id', $storeId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
        if ($taken) {
            throw \Illuminate\Validation\ValidationException::withMessages(['name' => 'Your store already has a role with this name.']);
        }

        $unknown = array_diff(array_keys($data['modules'] ?? []), array_keys(StaffAccess::modules()));
        if ($unknown) {
            throw \Illuminate\Validation\ValidationException::withMessages(['modules' => 'Unknown module: ' . implode(', ', $unknown)]);
        }

        $data['name']    = $name;
        $data['modules'] = array_filter($data['modules'] ?? [], fn ($l) => in_array($l, StaffAccess::LEVELS, true));

        return $data;
    }
}
