<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Mail\StaffAccountCreated;
use App\Models\AccountAction;
use App\Models\Permission;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserPermission;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Inertia\Inertia;
use Inertia\Response;

class StaffController extends Controller
{
    public function index(Request $request): Response
    {
        $store  = request()->attributes->get('seller_store');
        $search = $request->input('search');
        $tab    = $request->input('tab', 'active');

        $query = User::withTrashed()
            ->where('store_id', $store->id)
            ->where('role', 'seller_staff');

        if ($tab === 'archived') {
            $query->onlyTrashed();
        } else {
            $query->whereNull('deleted_at');
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $staff = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($u) => [
                'id'             => $u->id,
                'name'           => $u->name,
                'first_name'     => $u->first_name,
                'middle_name'    => $u->middle_name,
                'last_name'      => $u->last_name,
                'email'          => $u->email,
                'phone'          => $u->phone,
                'sub_role'       => $u->sub_role,
                'schedule_start' => $u->schedule_start,
                'schedule_end'   => $u->schedule_end,
                'is_active'      => $u->is_active,
                'created_at'     => $u->created_at->format('M d, Y'),
                'deleted_at'     => $u->deleted_at?->format('M d, Y'),
            ]);

        $counts = [
            'active'   => User::where('store_id', $store->id)->where('role', 'seller_staff')->count(),
            'archived' => User::onlyTrashed()->where('store_id', $store->id)->where('role', 'seller_staff')->count(),
        ];

        return Inertia::render('seller/staff', [
            'staff'         => $staff,
            'archivedCount' => $counts['archived'],
            'tab'           => $tab,
            'filters'       => ['search' => $search ?? ''],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            'first_name'     => 'required|string|max:100',
            'middle_name'    => 'nullable|string|max:100',
            'last_name'      => 'required|string|max:100',
            'email'          => 'required|email|unique:users,email',
            'phone'          => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'sub_role'       => 'required|in:cashier,warehouse,rider,hr',
            'schedule_start' => 'required|string|max:10',
            'schedule_end'   => 'required|string|max:10',
        ]);

        $data['schedule_start'] = $this->parseTime($data['schedule_start'] ?? null);
        $data['schedule_end']   = $this->parseTime($data['schedule_end']   ?? null);

        $fullName     = trim("{$data['first_name']} {$data['last_name']}");
        $tempPassword = strtolower($data['last_name']);
        if (strlen($tempPassword) < 8) {
            $tempPassword .= '123';
        }

        $user = User::create([
            'name'                => $fullName,
            'first_name'          => $data['first_name'],
            'middle_name'         => $data['middle_name'] ?? null,
            'last_name'           => $data['last_name'],
            'email'               => $data['email'],
            'phone'               => $data['phone'] ?? null,
            'role'                => 'seller_staff',
            'sub_role'            => $data['sub_role'],
            'store_id'            => $store->id,
            'schedule_start'      => $data['schedule_start'] ?? null,
            'schedule_end'        => $data['schedule_end'] ?? null,
            'password'            => Hash::make($tempPassword),
            'must_change_password' => true,
            'is_active'           => true,
            'email_verified_at'   => now(),
        ]);

        Mail::to($user->email)->send(new StaffAccountCreated($user, $store->store_name, $tempPassword));

        return redirect()->route('seller.staff')->with('success', "{$fullName} added as {$data['sub_role']}. Login credentials sent to {$data['email']}.");
    }

    public function show(User $user): Response
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        // Seller-relevant permission groups only
        $sellerGroups = ['Dashboard', 'Products', 'Orders', 'Deliveries', 'Invoices', 'Inventory', 'DSS', 'Settings'];

        $allPermissions = Permission::orderBy('group')->orderBy('name')
            ->whereIn('group', $sellerGroups)
            ->get()
            ->groupBy('group')
            ->map(fn ($perms) => $perms->map(fn ($p) => [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
            ])->values())
            ->toArray();

        $roleKey = $user->sub_role ?? 'seller_staff';

        $roleDefaults = RolePermission::where('role', $roleKey)
            ->with('permission')
            ->get()
            ->pluck('permission.name')
            ->filter()
            ->values()
            ->toArray();

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

        return Inertia::render('seller/staff-show', [
            'staff' => [
                'id'             => $user->id,
                'name'           => $user->name,
                'first_name'     => $user->first_name,
                'middle_name'    => $user->middle_name,
                'last_name'      => $user->last_name,
                'email'          => $user->email,
                'phone'          => $user->phone,
                'sub_role'       => $user->sub_role,
                'schedule_start' => $user->schedule_start,
                'schedule_end'   => $user->schedule_end,
                'is_active'      => (bool) $user->is_active,
                'created_at'     => $user->created_at->format('M d, Y'),
            ],
            'allPermissions' => (object) $allPermissions,
            'roleDefaults'   => $roleDefaults,
            'userOverrides'  => $userOverrides,
        ]);
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'first_name'     => 'required|string|max:100',
            'middle_name'    => 'nullable|string|max:100',
            'last_name'      => 'required|string|max:100',
            'email'          => "required|email|unique:users,email,{$user->id}",
            'phone'          => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'sub_role'       => 'required|in:cashier,warehouse,rider,hr',
            'schedule_start' => 'nullable|string|max:10',
            'schedule_end'   => 'nullable|string|max:10',
        ]);

        $data['schedule_start'] = $this->parseTime($data['schedule_start'] ?? null);
        $data['schedule_end']   = $this->parseTime($data['schedule_end']   ?? null);

        $fullName = trim("{$data['first_name']} {$data['last_name']}");

        $updates = [
            'name'           => $fullName,
            'first_name'     => $data['first_name'],
            'middle_name'    => $data['middle_name'] ?? null,
            'last_name'      => $data['last_name'],
            'email'          => $data['email'],
            'phone'          => $data['phone'] ?? null,
            'sub_role'       => $data['sub_role'],
            'schedule_start' => $data['schedule_start'] ?? null,
            'schedule_end'   => $data['schedule_end'] ?? null,
        ];

        $user->update($updates);
        return back()->with('success', "{$fullName} updated.");
    }

    public function updatePermissions(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        $request->validate([
            'permissions' => ['array'],
        ]);

        $permMap = Permission::pluck('id', 'name');
        UserPermission::where('user_id', $user->id)->delete();

        foreach ($request->input('permissions', []) as $name => $granted) {
            if ($granted === null || ! isset($permMap[$name])) {
                continue; // null = remove override (reset to role default)
            }
            UserPermission::create([
                'user_id'       => $user->id,
                'permission_id' => $permMap[$name],
                'granted'       => (bool) $granted,
            ]);
        }

        return redirect()->route('seller.staff.show', $user)->with('success', 'Permissions updated successfully.');
    }

    public function resetPermissions(User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        UserPermission::where('user_id', $user->id)->delete();

        return redirect()->route('seller.staff.show', $user)->with('success', 'Permissions reset to defaults.');
    }

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

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
        return redirect()->route('seller.staff', ['tab' => 'archived'])->with('success', "{$user->name} archived.");
    }

    public function restore(User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        $user->restore();
        $user->update([
            'is_active'           => true,
            'deactivation_reason' => null,
            'deactivation_notes'  => null,
            'deactivated_at'      => null,
            'deactivated_by'      => null,
        ]);
        return redirect()->route('seller.staff')->with('success', "{$user->name} restored.");
    }

    public function forceDestroy(User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        $name = $user->name;
        UserPermission::where('user_id', $user->id)->forceDelete();
        $user->forceDelete();

        return redirect()->route('seller.staff', ['tab' => 'archived'])->with('success', "{$name} permanently deleted.");
    }

    public function toggle(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        if ($user->is_active) {
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

            return back()->with('success', "{$user->name} deactivated.");
        }

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
            'performed_by' => $request->user()->id,
        ]);

        return back()->with('success', "{$user->name} activated.");
    }

    private function parseTime(?string $value): ?string
    {
        if (! $value) return null;
        foreach (['H:i', 'g:i A', 'h:i A', 'G:i'] as $format) {
            $dt = \DateTime::createFromFormat($format, trim($value));
            if ($dt) return $dt->format('H:i');
        }
        return null;
    }
}
