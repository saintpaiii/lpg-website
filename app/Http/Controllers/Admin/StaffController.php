<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountAction;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class StaffController extends Controller
{
    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'active');

        $query = User::withTrashed()
            ->where('is_platform_staff', true)
            ->where('is_admin', false)
            ->whereNotIn('role', ['admin', 'platform_admin'])
            ->withCount(['userPermissions as permission_count' => fn ($q) => $q->where('granted', true)]);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        } else {
            $query->whereNull('deleted_at');
        }

        if ($search = $request->input('search')) {
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
            );
        }

        $staff = $query->orderBy('name')->paginate(20)->withQueryString()
            ->through(fn ($u) => [
                'id'               => $u->id,
                'name'             => $u->name,
                'email'            => $u->email,
                'phone'            => $u->phone,
                'sub_role'         => $u->sub_role,
                'is_active'        => (bool) $u->is_active,
                'created_at'       => $u->created_at->format('M d, Y'),
                'deleted_at'       => $u->deleted_at?->format('M d, Y'),
                'permission_count' => (int) $u->permission_count,
            ]);

        $archivedCount = User::onlyTrashed()
            ->where('is_platform_staff', true)
            ->where('is_admin', false)
            ->count();

        return Inertia::render('admin/staff', [
            'staff'         => $staff,
            'tab'           => $tab,
            'archivedCount' => $archivedCount,
            'filters'       => $request->only('search', 'tab'),
        ]);
    }

    // ── Store (create platform staff account) ─────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => ['required', 'string', Password::min(8)->mixedCase()->numbers()->symbols()],
            'phone'    => 'nullable|string|max:20',
            'sub_role' => 'required|in:manager,moderator,support_staff,accountant',
        ]);

        $user = User::create([
            'name'              => $data['name'],
            'email'             => $data['email'],
            'password'          => Hash::make($data['password']),
            'phone'             => $data['phone'] ?? null,
            'sub_role'          => $data['sub_role'],
            'role'              => 'platform_staff',
            'is_platform_staff' => true,
            'is_active'         => true,
            'is_admin'          => false,
            'email_verified_at' => now(),
        ]);

        // Redirect to their profile so admin can set permissions immediately
        return redirect()->route('admin.staff.show', $user->id)
            ->with('success', "Platform staff account for {$user->name} created. Set their permissions below.");
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(User $user): Response
    {
        // Admin-relevant permission groups only
        $adminGroups = ['Dashboard', 'Stores', 'Verifications', 'Invoices', 'Reports', 'DSS', 'User Management', 'Settings'];

        $allPermissions = Permission::orderBy('group')->orderBy('name')
            ->whereIn('group', $adminGroups)
            ->get()
            ->groupBy('group')
            ->map(fn ($perms) => $perms->map(fn ($p) => [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
            ])->values())
            ->toArray();

        // Platform staff have no role-based defaults — all permissions are explicit grants
        $roleDefaults = [];

        $userOverrides = UserPermission::where('user_id', $user->id)
            ->with('permission')
            ->get()
            ->map(fn ($up) => [
                'permission' => $up->permission?->name,
                'granted'    => (bool) $up->granted,
            ])
            ->filter(fn ($o) => $o['permission'] !== null)
            ->values()
            ->toArray();

        $history = AccountAction::where('target_type', 'user')
            ->where('target_id', $user->id)
            ->with('performer:id,name')
            ->orderByDesc('created_at')
            ->limit(30)
            ->get()
            ->map(fn ($a) => [
                'id'           => $a->id,
                'action'       => $a->action,
                'reason'       => $a->reason,
                'notes'        => $a->notes,
                'performed_by' => $a->performer?->name ?? '—',
                'created_at'   => $a->created_at->format('M d, Y g:i A'),
            ]);

        return Inertia::render('admin/staff-show', [
            'staff' => [
                'id'                  => $user->id,
                'name'                => $user->name,
                'email'               => $user->email,
                'phone'               => $user->phone,
                'sub_role'            => $user->sub_role,
                'is_active'           => (bool) $user->is_active,
                'deactivation_reason' => $user->deactivation_reason,
                'deactivation_notes'  => $user->deactivation_notes,
                'deactivated_at'      => $user->deactivated_at?->format('M d, Y g:i A'),
                'created_at'          => $user->created_at->format('M d, Y'),
            ],
            'allPermissions' => (object) $allPermissions,
            'roleDefaults'   => $roleDefaults,
            'userOverrides'  => $userOverrides,
            'history'        => $history,
        ]);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public function update(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => "required|email|unique:users,email,{$user->id}",
            'password' => ['nullable', 'string', Password::min(8)->mixedCase()->numbers()->symbols()],
            'phone'    => 'nullable|string|max:20',
            'sub_role' => 'required|in:manager,moderator,support_staff,accountant',
        ]);

        $updates = [
            'name'     => $data['name'],
            'email'    => $data['email'],
            'phone'    => $data['phone'] ?? null,
            'sub_role' => $data['sub_role'],
        ];

        if (! empty($data['password'])) {
            $updates['password'] = Hash::make($data['password']);
        }

        $user->update($updates);

        return back()->with('success', "{$user->name}'s profile updated.");
    }

    // ── Update Position ───────────────────────────────────────────────────────

    public function updatePosition(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'sub_role' => 'required|in:manager,moderator,support_staff,accountant',
        ]);

        $user->update(['sub_role' => $data['sub_role']]);

        return back()->with('success', "{$user->name}'s position updated.");
    }

    // ── Update Permissions ────────────────────────────────────────────────────

    /**
     * Save per-user permission overrides.
     * Expects: { permissions: { 'dashboard.view': true|false|null } }
     * null = remove override (clear explicit grant)
     */
    public function updatePermissions(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'permissions'   => 'present|array',
            'permissions.*' => 'nullable|boolean',
        ]);

        foreach ($data['permissions'] as $permName => $granted) {
            $perm = Permission::where('name', $permName)->first();
            if (! $perm) continue;

            if ($granted === null) {
                UserPermission::withTrashed()
                    ->where('user_id', $user->id)
                    ->where('permission_id', $perm->id)
                    ->forceDelete();
            } else {
                $existing = UserPermission::withTrashed()
                    ->where('user_id', $user->id)
                    ->where('permission_id', $perm->id)
                    ->first();

                if ($existing) {
                    $existing->granted    = $granted;
                    $existing->deleted_at = null;
                    $existing->save();
                } else {
                    UserPermission::create([
                        'user_id'       => $user->id,
                        'permission_id' => $perm->id,
                        'granted'       => $granted,
                    ]);
                }
            }
        }

        return back()->with('success', "Permissions updated for {$user->name}.");
    }

    // ── Reset Permissions ─────────────────────────────────────────────────────

    public function resetPermissions(User $user): RedirectResponse
    {
        UserPermission::withTrashed()->where('user_id', $user->id)->forceDelete();

        return back()->with('success', "All permissions cleared for {$user->name}.");
    }

    // ── Toggle Active ─────────────────────────────────────────────────────────

    public function toggle(Request $request, User $user): RedirectResponse
    {
        if ($user->is_active) {
            // Deactivating — reason required
            $request->validate([
                'reason' => ['required', 'string', 'max:255'],
                'notes'  => ['nullable', 'string', 'max:1000'],
            ]);

            $user->update([
                'is_active'           => false,
                'deactivation_reason' => $request->reason,
                'deactivation_notes'  => $request->notes,
                'deactivated_at'      => now(),
                'deactivated_by'      => $request->user()->id,
            ]);

            AccountAction::create([
                'target_type'  => 'user',
                'target_id'    => $user->id,
                'action'       => 'deactivate',
                'reason'       => $request->reason,
                'notes'        => $request->notes,
                'performed_by' => $request->user()->id,
            ]);

            return back()->with('success', "{$user->name} has been deactivated.");
        }

        // Activating — no reason needed, clear deactivation fields
        $user->update([
            'is_active'           => true,
            'deactivation_reason' => null,
            'deactivation_notes'  => null,
            'deactivated_at'      => null,
            'deactivated_by'      => null,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'activate',
            'reason'       => null,
            'notes'        => null,
            'performed_by' => $request->user()->id,
        ]);

        return back()->with('success', "{$user->name} has been activated.");
    }

    // ── Destroy (soft delete) ─────────────────────────────────────────────────

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'notes'  => ['nullable', 'string', 'max:1000'],
        ]);

        $user->update([
            'is_active'           => false,
            'deactivation_reason' => $request->reason,
            'deactivation_notes'  => $request->notes,
            'deactivated_at'      => now(),
            'deactivated_by'      => $request->user()->id,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'archive',
            'reason'       => $request->reason,
            'notes'        => $request->notes,
            'performed_by' => $request->user()->id,
        ]);

        $user->delete();

        return redirect()->route('admin.staff')->with('success', "{$user->name}'s account has been archived.");
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    public function restore(Request $request, User $user): RedirectResponse
    {
        $user->restore();
        $user->update([
            'is_active'           => true,
            'deactivation_reason' => null,
            'deactivation_notes'  => null,
            'deactivated_at'      => null,
            'deactivated_by'      => null,
        ]);

        AccountAction::create([
            'target_type'  => 'user',
            'target_id'    => $user->id,
            'action'       => 'restore',
            'reason'       => null,
            'notes'        => $request->input('notes'),
            'performed_by' => $request->user()->id,
        ]);

        return back()->with('success', "{$user->name}'s account has been restored.");
    }

    // ── Force Delete ──────────────────────────────────────────────────────────

    public function forceDestroy(User $user): RedirectResponse
    {
        $name = $user->name;
        UserPermission::withTrashed()->where('user_id', $user->id)->forceDelete();
        $user->forceDelete();

        return back()->with('success', "{$name}'s account has been permanently deleted.");
    }
}
