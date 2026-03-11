<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
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
        'is_active',
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
            'is_active'               => 'boolean',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin' || (bool) $this->is_admin;
    }

    public function isStaff(): bool
    {
        return in_array($this->role, ['admin', 'manager', 'cashier', 'warehouse']) || (bool) $this->is_admin;
    }

    public function isRider(): bool
    {
        return $this->role === 'rider';
    }

    /**
     * Check if this user has a given permission.
     * - Admin always returns true.
     * - user_permissions override role_permissions (can grant or revoke).
     * - Falls back to role_permissions default.
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

        // Fall back to role default
        return RolePermission::where('role', $this->role)
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

        // Start with role defaults
        $rolePerms = RolePermission::where('role', $this->role)
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
}
