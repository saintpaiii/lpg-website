<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Mail\StaffAccountCreated;
use App\Models\AccountAction;
use App\Models\Permission;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserPermission;
use App\Services\NotificationService;
use App\Services\StaffAccess;
use App\Services\StoreRoleService;
use App\Services\SubscriptionService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
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
        } elseif ($tab === 'paused') {
            $query->whereNull('deleted_at')->where('paused_by_plan', true);
        } else {
            $query->whereNull('deleted_at');
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $page = $query->latest()->paginate(20)->withQueryString();
        // The store's riders who can deliver (one query): removing the last one hides the store from customers
        $eligible = $store->eligibleRiders()->pluck('users.id')->all();
        // Driver's license status of the riders on this page (one query)
        $license = \App\Services\StaffDocumentService::forRiders($page->getCollection());
        // Role names + ids of the people on this page (one query each)
        $roleNames = StaffAccess::roleNamesFor($page->getCollection());
        $roleIds   = \Illuminate\Support\Facades\DB::table('store_role_user')->whereIn('user_id', $page->getCollection()->pluck('id'))
            ->get()->groupBy('user_id')->map(fn ($r) => $r->pluck('store_role_id')->map(fn ($id) => (int) $id)->all());
        $staff = $page
            ->through(fn ($u) => [
                'id'             => $u->id,
                'name'           => $u->name,
                'first_name'     => $u->first_name,
                'middle_name'    => $u->middle_name,
                'last_name'      => $u->last_name,
                'email'          => $u->email,
                'phone'          => $u->phone,
                'sub_role'       => $u->sub_role,
                'role_names'     => $roleNames[$u->id] ?? [],
                'role_ids'       => $roleIds[$u->id] ?? [],
                'work_days'      => $u->workDays(),
                'schedule_start' => $u->schedule_start,
                'schedule_end'   => $u->schedule_end,
                'is_active'      => $u->is_active,
                'paused_by_plan' => (bool) $u->paused_by_plan,
                'is_last_eligible_rider' => $eligible === [$u->id],
                'created_at'     => $u->created_at->format('M d, Y'),
                'deleted_at'     => $u->deleted_at?->format('M d, Y'),
                'license_status' => $u->sub_role === 'rider' ? ($license[$u->id]['license_status'] ?? 'missing') : null,
            ]);

        $counts = [
            'active'   => User::where('store_id', $store->id)->where('role', 'seller_staff')->count(),
            'archived' => User::onlyTrashed()->where('store_id', $store->id)->where('role', 'seller_staff')->count(),
        ];

        return Inertia::render('seller/staff', [
            'staff'         => $staff,
            'archivedCount' => $counts['archived'],
            'pausedCount'   => User::where('store_id', $store->id)->where('role', 'seller_staff')->where('paused_by_plan', true)->count(),
            'planLimit'     => $this->planLimit($store),
            'tab'           => $tab,
            'filters'       => ['search' => $search ?? ''],
            // Set only right after an account was created but its welcome email failed
            'tempCredentials' => $request->session()->get('staff_temp_password'),
            // Staff roles (Roles tab + the Add / Edit form); creating / editing is a Pro feature
            'roles'          => StoreRoleService::listFor($store),
            'canEditRoles'   => StoreRoleService::canEdit($store),
            'modules'        => collect(StaffAccess::modules())->map(fn ($m, $k) => [
                'key' => $k, 'label' => $m['label'], 'description' => $m['description'],
                'view_only' => (bool) ($m['view_only'] ?? false), 'feature' => $m['feature'] ?? null,
            ])->values(),
            // "Start from" choices of a new role = the starter role definitions
            'templates'      => collect(config('staff_modules.starters'))->map(fn ($t, $k) => [
                'key' => $k, 'name' => $t['name'], 'is_rider' => (bool) $t['is_rider'], 'modules' => (object) $t['modules'],
            ])->values(),
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
            'role_ids'       => 'required|array|min:1',
            'role_ids.*'     => ['integer', \Illuminate\Validation\Rule::exists('store_roles', 'id')->where('store_id', $store->id)],
            'work_days'      => 'nullable|array',
            'work_days.*'    => 'integer|between:1,7',
            'schedule_start' => 'required|string|max:10',
            'schedule_end'   => 'required|string|max:10',
        ], [
            'role_ids.required' => 'Choose at least one role.',
            'role_ids.min'      => 'Choose at least one role.',
        ]);

        // Plan limit: refuse BEFORE the account is created / the email is sent
        if (! SubscriptionService::canAdd($store, 'staff')) {
            return back()->withErrors(['email' => SubscriptionService::limitMessage($store, 'staff')]);
        }

        $data['schedule_start'] = $this->parseTime($data['schedule_start'] ?? null);
        $data['schedule_end']   = $this->parseTime($data['schedule_end']   ?? null);

        $fullName     = trim("{$data['first_name']} {$data['last_name']}");
        $tempPassword = self::randomPassword();   // emailed; they must change it at first login

        $user = User::create([
            'name'                => $fullName,
            'first_name'          => $data['first_name'],
            'middle_name'         => $data['middle_name'] ?? null,
            'last_name'           => $data['last_name'],
            'email'               => $data['email'],
            'phone'               => $data['phone'] ?? null,
            'role'                => 'seller_staff',
            'sub_role'            => 'custom',   // derived from the roles right below
            'store_id'            => $store->id,
            'schedule_start'      => $data['schedule_start'] ?? null,
            'schedule_end'        => $data['schedule_end'] ?? null,
            'work_days'           => self::workDays($data['work_days'] ?? null),
            'password'            => Hash::make($tempPassword),
            'must_change_password' => true,
            'is_active'           => true,
            'email_verified_at'   => now(),
        ]);

        StoreRoleService::assign($user, $data['role_ids']);
        $roleList = implode(', ', StaffAccess::roleNames($user->fresh()));

        // The account is saved first; a mail problem must never undo it or show a 500
        $mailed = true;
        try {
            Mail::to($user->email)->send(new StaffAccountCreated($user, $store->store_name, $tempPassword));
        } catch (\Throwable $e) {
            $mailed = false;
            Log::warning('Staff welcome email failed', ['user_id' => $user->id, 'store_id' => $store->id, 'error' => $e->getMessage()]);
        }

        NotificationService::send(
            $user->id,
            'system',
            'Welcome to ' . $store->store_name,
            $mailed
                ? 'Your staff account has been created. Check your email for login credentials.'
                : 'Your staff account has been created. Your store owner will give you your temporary password.',
            ['store_id' => $store->id]
        );

        if (! $mailed) {
            // Shown once, only to the owner who created the account (flashed for the next page only)
            return redirect()->route('seller.staff')
                ->with('warning', "Account created, but the welcome email couldn't be sent. Give them this temporary password: {$tempPassword}")
                ->with('staff_temp_password', ['name' => $fullName, 'email' => $user->email, 'password' => $tempPassword]);
        }

        return redirect()->route('seller.staff')->with('success', "{$fullName} added as {$roleList}. Login credentials sent to {$data['email']}.");
    }

    /** 12 characters, letters + digits, no look-alikes (0/O, 1/l/I). */
    public static function randomPassword(int $length = 12): string
    {
        $letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
        $digits  = '23456789';
        $all     = $letters . $digits;
        do {
            $p = '';
            for ($i = 0; $i < $length; $i++) {
                $p .= $all[random_int(0, strlen($all) - 1)];
            }
        } while (! preg_match('/[a-zA-Z]/', $p) || ! preg_match('/\d/', $p));

        return $p;
    }

    /** Work days from the form (ISO 1=Mon…7=Sun); Mon–Sat when nothing was sent. */
    private static function workDays(?array $days): array
    {
        $days = array_values(array_unique(array_map('intval', $days ?? [])));
        sort($days);

        return $days ?: [1, 2, 3, 4, 5, 6];
    }

    public function show(User $user): Response
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        // Store-portal modules (config/staff_modules.php) — one group per module, its permissions inside
        $byName = Permission::whereIn('name', StaffAccess::allModulePermissions())->get()->keyBy('name');
        $allPermissions = [];
        foreach (StaffAccess::modules() as $module) {
            $allPermissions[$module['label']] = collect($module['permissions'])
                ->filter(fn ($n) => isset($byName[$n]))
                ->map(fn ($n) => ['id' => $byName[$n]->id, 'name' => $n, 'description' => $byName[$n]->description])
                ->values()->all();
        }

        // What the person's roles give (the overrides are shown on top as "extra access")
        $roleDefaults = StaffAccess::rolePermissions($user);

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
                'role_names'     => StaffAccess::roleNames($user),
                'role_ids'       => StaffAccess::roles($user)->pluck('id')->all(),
                'work_days'      => $user->workDays(),
                'schedule_start' => $user->schedule_start,
                'schedule_end'   => $user->schedule_end,
                'is_active'      => (bool) $user->is_active,
                'paused_by_plan' => (bool) $user->paused_by_plan,
                'is_last_eligible_rider' => $store->eligibleRiders()->pluck('users.id')->all() === [$user->id],
                'busy'           => SubscriptionService::riderIsBusy($user),
                'created_at'     => $user->created_at->format('M d, Y'),
            ],
            'planLimit'      => $this->planLimit($store),
            'roles'          => StoreRoleService::listFor($store),
            'allPermissions' => (object) $allPermissions,
            'roleDefaults'   => $roleDefaults,
            'userOverrides'  => $userOverrides,
            // Documents this staff member uploaded (the owner approves / rejects them here)
            'documents'      => \App\Models\StaffDocument::where('user_id', $user->id)->with('reviewer:id,name')->latest()->get()
                ->map(fn ($d) => [
                    'id'              => $d->id,
                    'doc_type'        => $d->doc_type,
                    'label'           => \App\Services\StaffDocumentService::label($d->doc_type, $d->label),
                    'document_number' => $d->document_number,
                    'expires'         => $d->expires_at?->toDateString(),
                    'expires_on'      => $d->expires_at?->format('M j, Y'),
                    'status'          => $d->status,
                    'reason'          => $d->rejection_reason,
                    'reviewer'        => $d->reviewer?->name,
                    'date'            => $d->created_at->timezone('Asia/Manila')->format('M j, Y'),
                    'url'             => \App\Support\PrivateDocument::url('staff-document', $d->id, 'file_path'),
                ])->values(),
            'license'        => $user->sub_role === 'rider' ? [
                'status'  => \App\Services\StaffDocumentService::riderLicenseStatus($user),
                'message' => \App\Services\StaffDocumentService::message($user),
            ] : null,
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
            'role_ids'       => 'required|array|min:1',
            'role_ids.*'     => ['integer', \Illuminate\Validation\Rule::exists('store_roles', 'id')->where('store_id', $store->id)],
            'work_days'      => 'nullable|array',
            'work_days.*'    => 'integer|between:1,7',
            'schedule_start' => 'nullable|string|max:10',
            'schedule_end'   => 'nullable|string|max:10',
        ], [
            'role_ids.required' => 'Choose at least one role.',
            'role_ids.min'      => 'Choose at least one role.',
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
            'schedule_start' => $data['schedule_start'] ?? null,
            'schedule_end'   => $data['schedule_end'] ?? null,
            'work_days'      => self::workDays($data['work_days'] ?? null),
        ];

        $user->update($updates);
        StoreRoleService::assign($user, $data['role_ids']);   // re-derives sub_role (rider or not)
        return back()->with('success', "{$fullName} updated.");
    }

    public function updatePermissions(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        $request->validate([
            'permissions' => ['array'],
        ]);

        // Only store-portal permissions (never platform ones like users.* / stores.*)
        $permMap = Permission::whereIn('name', StaffAccess::allModulePermissions())->pluck('id', 'name');
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

        StaffAccess::forget($user);
        \Illuminate\Support\Facades\Cache::forget(\App\Services\SidebarBadgeService::key($user->id));

        return redirect()->route('seller.staff.show', $user)->with('success', 'Extra access updated.');
    }

    public function resetPermissions(User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id) abort(403);

        UserPermission::where('user_id', $user->id)->delete();

        StaffAccess::forget($user);
        \Illuminate\Support\Facades\Cache::forget(\App\Services\SidebarBadgeService::key($user->id));

        return redirect()->route('seller.staff.show', $user)->with('success', 'Extra access removed — only the roles apply now.');
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

        // Restoring re-activates the account: it counts against the plan unless it is paused
        if (! $user->paused_by_plan && ! SubscriptionService::canAdd($store, 'staff')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'staff'));
        }

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

        // A paused account doesn't count until it is un-paused
        if (! $user->paused_by_plan && ! SubscriptionService::canAdd($store, 'staff')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'staff'));
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

    /** Pause (plan limit) / Activate — lets the owner choose which accounts stay active. */
    public function togglePlanPause(Request $request, User $user): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($user->store_id !== $store->id || $user->role !== 'seller_staff') abort(403);

        if (! $user->paused_by_plan) {
            if (SubscriptionService::riderIsBusy($user)) {
                return back()->with('error', 'Finish or reassign their active delivery first.');
            }
            $user->update(['paused_by_plan' => true]);
            SubscriptionService::revokeTokens([$user->id]);
            SubscriptionService::forgetSummary($store->id);

            return back()->with('success', "{$user->name} paused. They can't log in until you activate them again.");
        }

        if ($user->is_active && ! SubscriptionService::canAdd($store, 'staff')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'staff'));
        }
        $user->update(['paused_by_plan' => false]);
        SubscriptionService::forgetSummary($store->id);

        return back()->with('success', "{$user->name} activated.");
    }

    private function planLimit($store): array
    {
        return [
            'used'    => SubscriptionService::usage($store)['staff'],
            'limit'   => SubscriptionService::limits($store)['staff'],
            'plan'    => SubscriptionService::summary($store)['last_name'] ?? 'Basic',
            'message' => SubscriptionService::limitMessage($store, 'staff'),
            'can_add' => SubscriptionService::canAdd($store, 'staff'),
        ];
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
