<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Permission;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class StaffController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private function formatUser(User $u, array $todayDeliveries = []): array
    {
        return [
            'id'         => $u->id,
            'name'       => $u->name,
            'email'      => $u->email,
            'phone'      => $u->phone,
            'role'       => $u->role,
            'is_active'  => (bool) $u->is_active,
            'created_at' => $u->created_at->format('M d, Y'),
            'deleted_at' => $u->deleted_at?->format('M d, Y g:i A'),
            'today_deliveries' => $todayDeliveries[$u->id] ?? 0,
        ];
    }

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'active');

        // Show only staff roles — never admins or customers
        $query = User::whereIn('role', ['manager', 'cashier', 'warehouse', 'rider'])
            ->where('is_admin', false);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }

        if ($role = $request->input('role')) {
            $query->where('role', $role);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $staff = $query->orderBy('name')->paginate(20)->withQueryString();

        // Today's delivery counts per rider
        $todayDeliveries = Delivery::select('rider_id', DB::raw('COUNT(*) as cnt'))
            ->whereIn('rider_id', $staff->pluck('id'))
            ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])
            ->whereDate('assigned_at', today())
            ->groupBy('rider_id')
            ->pluck('cnt', 'rider_id')
            ->toArray();

        $paginated = $staff->through(fn ($u) => $this->formatUser($u, $todayDeliveries));

        $archivedCount = User::onlyTrashed()
            ->whereIn('role', ['manager', 'cashier', 'warehouse', 'rider'])
            ->where('is_admin', false)
            ->count();

        return Inertia::render('admin/staff', [
            'staff'         => $paginated,
            'tab'           => $tab,
            'archivedCount' => $archivedCount,
            'filters'       => $request->only('role', 'search', 'tab'),
        ]);
    }

    // ── Show (staff detail + delivery history) ────────────────────────────────

    public function show(User $user): Response
    {
        // Overall delivery stats
        $stats = Delivery::where('rider_id', $user->id)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status IN ('assigned','picked_up','in_transit') THEN 1 ELSE 0 END) as active
            ")
            ->first();

        $total        = (int) ($stats->total ?? 0);
        $delivered    = (int) ($stats->delivered ?? 0);
        $failed       = (int) ($stats->failed ?? 0);
        $active       = (int) ($stats->active ?? 0);
        $successRate  = $total > 0 ? round(($delivered / $total) * 100, 1) : 0;

        // This month
        $thisMonth = Delivery::where('rider_id', $user->id)
            ->whereYear('assigned_at',  now()->year)
            ->whereMonth('assigned_at', now()->month)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
            ")
            ->first();

        // Recent deliveries (paginated)
        $deliveries = Delivery::with(['order.customer'])
            ->where('rider_id', $user->id)
            ->latest('assigned_at')
            ->paginate(15)
            ->through(fn ($d) => [
                'id'           => $d->id,
                'status'       => $d->status,
                'notes'        => $d->notes,
                'assigned_at'  => $d->assigned_at?->format('M d, Y g:i A'),
                'delivered_at' => $d->delivered_at?->format('M d, Y g:i A'),
                'order' => $d->order ? [
                    'id'           => $d->order->id,
                    'order_number' => $d->order->order_number,
                    'total_amount' => (float) $d->order->total_amount,
                    'customer'     => $d->order->customer?->name,
                ] : null,
            ]);

        // Monthly delivery counts for the last 6 months (chart)
        $monthlyData = Delivery::where('rider_id', $user->id)
            ->where('assigned_at', '>=', now()->subMonths(6)->startOfMonth())
            ->selectRaw("DATE_FORMAT(assigned_at, '%Y-%m') as ym, COUNT(*) as total, SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered")
            ->groupBy('ym')
            ->orderBy('ym')
            ->get()
            ->map(fn ($r) => [
                'month'     => Carbon::createFromFormat('Y-m', $r->ym)->format('M Y'),
                'total'     => (int) $r->total,
                'delivered' => (int) $r->delivered,
            ]);

        // All permissions grouped for the permission manager
        $allPermissions = Permission::orderBy('group')->orderBy('name')->get()
            ->groupBy('group')
            ->map(fn ($perms) => $perms->map(fn ($p) => [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
            ])->values())
            ->toArray();

        // Role default permissions (names)
        $roleDefaults = RolePermission::where('role', $user->role)
            ->with('permission')
            ->get()
            ->pluck('permission.name')
            ->filter()
            ->values()
            ->toArray();

        // User-specific overrides
        $userOverrides = $user->userPermissions()->with('permission')->get()
            ->map(fn ($up) => [
                'permission' => $up->permission?->name,
                'granted'    => $up->granted,
            ])
            ->filter(fn ($o) => $o['permission'] !== null)
            ->values()
            ->toArray();

        return Inertia::render('admin/staff-show', [
            'staff' => $this->formatUser($user),
            'stats' => [
                'total'        => $total,
                'delivered'    => $delivered,
                'failed'       => $failed,
                'active'       => $active,
                'success_rate' => $successRate,
                'this_month'   => (int) ($thisMonth->total ?? 0),
                'this_month_delivered' => (int) ($thisMonth->delivered ?? 0),
            ],
            'deliveries'     => $deliveries,
            'monthlyData'    => $monthlyData,
            'allPermissions' => $allPermissions,
            'roleDefaults'   => $roleDefaults,
            'userOverrides'  => $userOverrides,
        ]);
    }

    // ── Store ─────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|unique:users,email',
            'password' => ['required', 'string', Password::min(8)],
            'phone'    => 'nullable|string|max:20',
            'role'     => 'required|in:manager,cashier,warehouse,rider',
        ]);

        $user = User::create([
            'name'              => $data['name'],
            'email'             => $data['email'],
            'password'          => Hash::make($data['password']),
            'phone'             => $data['phone'] ?? null,
            'role'              => $data['role'],
            'is_active'         => true,
            'is_admin'          => false,
            'email_verified_at' => now(), // Admin-created accounts are pre-verified
        ]);

        return back()->with('success', "Staff account for {$user->name} created.");
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public function update(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => "required|email|unique:users,email,{$user->id}",
            'password' => ['nullable', 'string', Password::min(8)],
            'phone'    => 'nullable|string|max:20',
            'role'     => 'required|in:manager,cashier,warehouse,rider',
        ]);

        $updates = [
            'name'  => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'] ?? null,
            'role'  => $data['role'],
        ];

        if (! empty($data['password'])) {
            $updates['password'] = Hash::make($data['password']);
        }

        $user->update($updates);

        return back()->with('success', "{$user->name}'s profile updated.");
    }

    // ── Toggle Active ─────────────────────────────────────────────────────────

    public function toggle(User $user): RedirectResponse
    {
        $user->update(['is_active' => ! $user->is_active]);

        $status = $user->is_active ? 'activated' : 'deactivated';
        return back()->with('success', "{$user->name} has been {$status}.");
    }

    // ── Destroy (soft delete) ─────────────────────────────────────────────────

    public function destroy(User $user): RedirectResponse
    {
        // Block if staff has active deliveries
        $activeDeliveries = Delivery::where('rider_id', $user->id)
            ->whereIn('status', ['assigned', 'picked_up', 'in_transit'])
            ->count();

        if ($activeDeliveries > 0) {
            return back()->with('error',
                "Cannot archive {$user->name} — they have {$activeDeliveries} active delivery(ies) in progress."
            );
        }

        // Deactivate first so they can't keep working, then soft-delete
        $user->update(['is_active' => false]);
        $user->delete();

        return back()->with('success', "{$user->name}'s account has been archived.");
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    public function restore(User $user): RedirectResponse
    {
        $user->restore();
        $user->update(['is_active' => true]);

        return back()->with('success', "{$user->name}'s account has been restored.");
    }

    // ── Force Delete ──────────────────────────────────────────────────────────

    public function forceDestroy(User $user): RedirectResponse
    {
        $name = $user->name;
        $user->forceDelete();

        return back()->with('success', "{$name}'s account has been permanently deleted.");
    }

    // ── Permission Management ─────────────────────────────────────────────────

    /**
     * Save per-user permission overrides.
     * Expects: { permissions: { 'orders.create': true|false|null } }
     * null = remove override (fall back to role default)
     */
    public function updatePermissions(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'permissions'   => 'required|array',
            'permissions.*' => 'nullable|boolean',
        ]);

        foreach ($data['permissions'] as $permName => $granted) {
            $perm = Permission::where('name', $permName)->first();
            if (! $perm) continue;

            if ($granted === null) {
                // Remove override — user falls back to role default
                UserPermission::where('user_id', $user->id)
                    ->where('permission_id', $perm->id)
                    ->delete();
            } else {
                UserPermission::updateOrCreate(
                    ['user_id' => $user->id, 'permission_id' => $perm->id],
                    ['granted' => $granted]
                );
            }
        }

        return back()->with('success', "Permissions updated for {$user->name}.");
    }

    /**
     * Reset all user-specific overrides; revert to role defaults.
     */
    public function resetPermissions(User $user): RedirectResponse
    {
        UserPermission::where('user_id', $user->id)->delete();

        return back()->with('success', "Permissions reset to role defaults for {$user->name}.");
    }
}
