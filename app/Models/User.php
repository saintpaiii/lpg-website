<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes, TwoFactorAuthenticatable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'is_admin',
        'is_platform_staff',
        'is_active',
        'valid_id',
        'id_verified',
        'store_id',
        'sub_role',
        'deactivation_reason',
        'deactivation_notes',
        'deactivated_at',
        'deactivated_by',
    ];

    protected $hidden = [
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'       => 'datetime',
            'password'                => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'is_admin'                => 'boolean',
            'is_platform_staff'       => 'boolean',
            'is_active'               => 'boolean',
            'id_verified'             => 'boolean',
        ];
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['admin', 'platform_admin']) || (bool) $this->is_admin;
    }

    public function isPlatformAdmin(): bool
    {
        return $this->role === 'platform_admin' || (bool) $this->is_admin;
    }

    public function isSeller(): bool
    {
        return $this->role === 'seller';
    }

    public function isSellerStaff(): bool
    {
        return $this->role === 'seller_staff';
    }

    public function isStaff(): bool
    {
        return in_array($this->role, ['admin', 'platform_admin', 'manager', 'cashier', 'warehouse', 'seller', 'seller_staff'])
            || (bool) $this->is_admin;
    }

    public function isRider(): bool
    {
        return $this->role === 'rider'
            || ($this->role === 'seller_staff' && $this->sub_role === 'rider');
    }

    /**
     * Determine the first admin URL a platform_staff user is allowed to visit.
     * Falls back to /admin/welcome if they have no permissions assigned yet.
     */
    public function platformStaffHomeUrl(): string
    {
        $permRouteMap = [
            'dashboard.view'     => 'admin.dashboard',
            'users.view'         => 'admin.users',
            'stores.view'        => 'admin.stores',
            'verifications.view' => 'admin.verifications',
            'invoices.view'      => 'admin.invoices',
            'reports.view'       => 'admin.reports',
            'dss.view'           => 'admin.dss',
            'settings.view'      => 'admin.settings',
        ];

        $permissions = $this->getPermissions();
        foreach ($permRouteMap as $perm => $routeName) {
            if (in_array($perm, $permissions)) {
                return route($routeName);
            }
        }

        return route('admin.welcome');
    }

    /**
     * Check if this user has a given permission.
     * - Admin / platform_admin always returns true.
     * - user_permissions override role_permissions (can grant or revoke).
     * - Falls back to role_permissions default.
     * - seller_staff falls back to their sub_role for permission lookup.
     */
    public function hasPermission(string $permission): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        $perm = \App\Models\Permission::where('name', $permission)->first();
        if (! $perm) {
            return false;
        }

        // Check user-level override
        $override = $this->userPermissions()->where('permission_id', $perm->id)->first();
        if ($override !== null) {
            return (bool) $override->granted;
        }

        // Platform staff (non-admin) rely solely on user_permissions grants
        if ($this->is_platform_staff) {
            return false;
        }

        // seller_staff uses sub_role for permission lookup (e.g. 'cashier', 'warehouse', 'rider')
        $roleKey = ($this->role === 'seller_staff' && $this->sub_role)
            ? $this->sub_role
            : $this->role;

        return RolePermission::where('role', $roleKey)
            ->where('permission_id', $perm->id)
            ->exists();
    }

    /**
     * Get all permission names this user has, as a flat array.
     */
    public function getPermissions(): array
    {
        if ($this->isAdmin()) {
            return \App\Models\Permission::pluck('name')->toArray();
        }

        // Platform staff (non-admin): only what's explicitly granted in user_permissions
        if ($this->is_platform_staff) {
            return $this->userPermissions()
                ->where('granted', true)
                ->with('permission')
                ->get()
                ->pluck('permission.name')
                ->filter()
                ->values()
                ->toArray();
        }

        $roleKey = ($this->role === 'seller_staff' && $this->sub_role)
            ? $this->sub_role
            : $this->role;

        // Start with role defaults
        $rolePerms = RolePermission::where('role', $roleKey)
            ->with('permission')
            ->get()
            ->pluck('permission.name')
            ->filter()
            ->toArray();

        // Apply user overrides
        $overrides = $this->userPermissions()->with('permission')->get();
        $granted   = $overrides->where('granted', true)->pluck('permission.name')->toArray();
        $revoked   = $overrides->where('granted', false)->pluck('permission.name')->toArray();

        $merged = array_unique(array_merge($rolePerms, $granted));
        return array_values(array_diff($merged, $revoked));
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    /** Store this user belongs to (as staff/seller) */
    public function store(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Store that this user owns (seller role) */
    public function ownedStore(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Store::class, 'user_id');
    }

    public function orders(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Order::class, 'created_by');
    }

    public function deliveries(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Delivery::class, 'rider_id');
    }

    public function inventoryTransactions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }

    public function userPermissions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(UserPermission::class);
    }

    public function verificationRequests(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(VerificationRequest::class);
    }
}
