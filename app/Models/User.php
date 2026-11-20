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
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'can_shop',
        'needs_account_choice',   // new Google user who hasn't picked buyer / seller-only yet (K1)
        'email',
        'password',
        'email_verified_at',
        'role',
        'phone',
        'is_admin',
        'is_platform_staff',
        'is_active',
        'paused_by_plan',
        'valid_id',
        'id_verified',
        'store_id',
        'sub_role',
        'schedule_start',
        'schedule_end',
        'work_days',
        'must_change_password',
        'daily_rate_override',
        'hourly_rate_override',
        'deactivation_reason',
        'deactivation_notes',
        'deactivated_at',
        'deactivated_by',
        'valid_id_path',
        'selfie_path',
        'id_verified_at',
        'id_verification_status',
        'id_rejection_reason',
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
            'paused_by_plan'          => 'boolean',
            'id_verified'             => 'boolean',
            'must_change_password'    => 'boolean',
            'daily_rate_override'     => 'decimal:2',
            'hourly_rate_override'    => 'decimal:2',
            'work_days'               => 'array',   // ISO weekdays 1=Mon…7=Sun; null = Mon–Sat
            'id_verified_at'          => 'datetime',
            'deactivated_at'          => 'datetime',
            'can_shop'                => 'boolean',
            'needs_account_choice'    => 'boolean',
        ];
    }

    /** Name suffixes offered after the last name (the dropdown and validation use this list) */
    public const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

    /**
     * Full display name: first + middle + last + suffix, e.g. "Juan Santos Dela Cruz Jr.".
     * Every place that builds `name` from the name parts uses this.
     */
    public static function composeName(?string $first, ?string $middle, ?string $last, ?string $suffix = null): string
    {
        return trim(preg_replace('/\s+/', ' ', implode(' ', array_filter(
            [trim((string) $first), trim((string) $middle), trim((string) $last), trim((string) $suffix)],
            fn ($p) => $p !== ''
        ))));
    }

    /**
     * K11 — split a full name for accounts that only have `name` (older / seeded accounts): a trailing suffix
     * ("Jr.") is taken off, the LAST word is the last name, everything before it the first name.
     *
     * @return array{first_name: string, last_name: string, suffix: string}
     */
    public static function splitName(?string $name): array
    {
        $words = preg_split('/\s+/', trim((string) $name), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $suffix = '';
        if (count($words) > 2) {
            $last = rtrim(end($words), '.,');
            foreach (static::SUFFIXES as $s) {
                if (strcasecmp(rtrim($s, '.'), $last) === 0) {
                    $suffix = $s;
                    array_pop($words);
                    break;
                }
            }
        }
        if (count($words) < 2) {
            return ['first_name' => $words[0] ?? '', 'last_name' => '', 'suffix' => $suffix];
        }
        $lastName = array_pop($words);

        return ['first_name' => rtrim(implode(' ', $words), ','), 'last_name' => $lastName, 'suffix' => $suffix];
    }

    /**
     * The name parts for a form: the stored ones, or — when first AND last name are empty — split from `name`, so
     * the person only has to confirm them (K11).
     *
     * @return array{first_name: string, middle_name: string, last_name: string, suffix: string}
     */
    public function nameParts(): array
    {
        if (trim((string) $this->first_name) !== '' || trim((string) $this->last_name) !== '') {
            return ['first_name' => (string) $this->first_name, 'middle_name' => (string) $this->middle_name,
                'last_name' => (string) $this->last_name, 'suffix' => (string) $this->suffix];
        }
        $split = static::splitName($this->name);

        return ['first_name' => $split['first_name'], 'middle_name' => (string) $this->middle_name,
            'last_name' => $split['last_name'], 'suffix' => (string) ($this->suffix ?: $split['suffix'])];
    }

    /**
     * K11 — fill first_name / last_name from `name` where BOTH are empty. Safe to run again and on live data: it
     * never touches a row that already has a first or last name. Returns how many rows were filled.
     */
    public static function backfillNameParts(): int
    {
        $n = 0;
        static::withTrashed()->where(fn ($q) => $q->whereNull('first_name')->orWhere('first_name', ''))
            ->where(fn ($q) => $q->whereNull('last_name')->orWhere('last_name', ''))
            ->whereNotNull('name')->where('name', '!=', '')
            ->select(['id', 'name', 'suffix'])->chunkById(200, function ($users) use (&$n) {
                foreach ($users as $u) {
                    $p = static::splitName($u->name);
                    // a plain query update: no model events, updated_at untouched, `name` not recomputed
                    static::withTrashed()->whereKey($u->id)->toBase()->update(array_filter([
                        'first_name' => $p['first_name'] ?: null,
                        'last_name'  => $p['last_name'] ?: null,
                        'suffix'     => $u->suffix ?: ($p['suffix'] ?: null),
                    ], fn ($v) => $v !== null));
                    $n++;
                }
            });

        return $n;
    }

    /** The name without the suffix — the ID name check uses it (an ID may or may not print "JR"). */
    public function nameWithoutSuffix(): string
    {
        $parts = static::composeName($this->first_name, $this->middle_name, $this->last_name);
        if ($parts !== '') {
            return $parts;
        }
        // Older accounts with only `name`: drop a trailing suffix
        $pattern = '/[\s,]+(' . implode('|', array_map(fn ($s) => preg_quote(rtrim($s, '.'), '/'), static::SUFFIXES)) . ')\.?$/i';

        return trim(preg_replace($pattern, '', (string) $this->name));
    }

    /** Seller-only account (registered on /seller/register): no Customer Portal, no cart, no orders. */
    public function isSellerOnly(): bool
    {
        return $this->role === 'seller' && $this->can_shop === false;
    }

    protected static function booted(): void
    {
        // Adding / changing / deactivating / archiving a store's staff (riders) can show or hide the store
        $forget = function (User $u) {
            if ($u->role === 'seller_staff' || $u->getOriginal('role') === 'seller_staff') {
                Store::forgetVisibilityCache($u->store_id);
                if ($u->getOriginal('store_id') && $u->getOriginal('store_id') !== $u->store_id) {
                    Store::forgetVisibilityCache((int) $u->getOriginal('store_id'));
                }
            }
        };
        static::saved($forget);
        static::deleted($forget);
        static::restored($forget);
    }

    public const PAUSED_BY_PLAN_MESSAGE = "Your account is paused because your store's current plan has reached its staff limit. Please contact your store owner.";

    /**
     * The user's verified-ID file: valid_id_path (ID verification, since 2026-04) or the old valid_id column.
     * Start Selling reuses it instead of asking for the ID again.
     */
    public function verifiedIdPath(): ?string
    {
        return $this->valid_id_path ?: ($this->valid_id ?: null);
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['admin', 'platform_admin']) || (bool) $this->is_admin;
    }

    public function isPlatformAdmin(): bool
    {
        return $this->role === 'platform_admin' || (bool) $this->is_admin;
    }

    /**
     * We verify email with a 6-digit code (OtpController), not a link.
     * Laravel would otherwise email a "click to verify" link on registration (Registered event).
     */
    public function sendEmailVerificationNotification(): void
    {
    }

    /**
     * "Forgot password" email (Fortify). A mail problem shows a friendly message on the form
     * instead of a 500 (the reset token is simply unused).
     */
    public function sendPasswordResetNotification($token): void
    {
        try {
            $this->notify(new \Illuminate\Auth\Notifications\ResetPassword($token));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Password reset email failed', ['user_id' => $this->id, 'error' => $e->getMessage()]);
            throw \Illuminate\Validation\ValidationException::withMessages([
                'email' => "We couldn't send the reset link right now, please try again.",
            ]);
        }
    }

    /**
     * The ONE home page of every role (login, "already logged in", landing, OTP, social login, error pages).
     * Store staff: the rider app for riders, else the first module they can view (config staff_modules.home_order),
     * else My Attendance.
     */
    public function homeUrl(): string
    {
        return match (true) {
            $this->role === 'platform_staff'                                   => $this->platformStaffHomeUrl(),
            in_array($this->role, ['platform_admin', 'admin', 'manager'], true) => route('admin.dashboard'),
            $this->role === 'seller'                                           => route('seller.dashboard'),
            $this->role === 'seller_staff'                                     => url(\App\Services\StaffAccess::homeUrl($this)),
            // Legacy single-distributor staff roles
            $this->role === 'cashier'                                          => route('admin.invoices'),
            $this->role === 'warehouse'                                        => route('admin.dashboard'),
            $this->role === 'rider'                                            => route('rider.deliveries'),
            $this->role === 'customer'                                         => route('customer.dashboard'),
            default                                                            => route('home'),
        };
    }

    /** Store roles of a staff member (store_role_user). */
    public function storeRoles(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(StoreRole::class, 'store_role_user');
    }

    /** Work days (ISO 1=Mon…7=Sun); default Mon–Sat. */
    public function workDays(): array
    {
        return $this->work_days ?: [1, 2, 3, 4, 5, 6];
    }

    public function worksOn(\DateTimeInterface|string $date): bool
    {
        return in_array((int) \Illuminate\Support\Carbon::parse($date)->isoWeekday(), array_map('intval', $this->workDays()), true);
    }

    /** Platform admins, or platform staff allowed to review verifications / stores — may open private documents. */
    public function canReviewDocuments(): bool
    {
        return $this->isAdmin()
            || ($this->is_platform_staff && ($this->hasPermission('verifications.view') || $this->hasPermission('stores.view')));
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

        // Store staff: their store roles + per-person extra access (one memoized check)
        if ($this->role === 'seller_staff') {
            return \App\Services\StaffAccess::can($this, $permission);
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

        $roleKey = $this->role;

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

        // Store staff: their store roles + per-person extra access
        if ($this->role === 'seller_staff') {
            return \App\Services\StaffAccess::permissionsFor($this);
        }

        $roleKey = $this->role;

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

    /** Store that this user owns (seller role) — J9: the MAIN store (branches have the same user_id) */
    public function ownedStore(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Store::class, 'user_id')->whereNull('parent_store_id');
    }

    /** J9: every store this user owns (main + branches) */
    public function ownedStores(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Store::class, 'user_id');
    }

    private ?bool $customerHistoryCache = null;

    /**
     * Has this account ever been a real customer: verified at least once (revoking keeps id_verified_at)
     * or placed an order. Brand-new unverified customers have no history, so their empty
     * history pages (orders, messages, invoices…) are locked too.
     */
    public function hasCustomerHistory(): bool
    {
        return $this->customerHistoryCache ??= $this->id_verified_at !== null
            || Order::whereHas('customer', fn ($q) => $q->where('user_id', $this->id))->exists();
    }

    /** Customer who was never verified and has no orders — only Verify ID, Profile, Addresses stay open. */
    public function isLockedNewcomer(): bool
    {
        return $this->role === 'customer'
            && $this->id_verification_status !== 'verified'
            && ! $this->hasCustomerHistory();
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

    public function customerLoyalties(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CustomerLoyalty::class);
    }
}
