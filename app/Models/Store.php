<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Store extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        // Tax & invoice (Settings → Tax & Invoice); invoice_next_number is only changed by InvoiceService
        'vat_status',
        'tin',
        'registered_name',
        'registered_address',
        'invoice_prefix',
        'store_name',
        'description',
        'address',
        'city',
        'barangay',
        'province',
        'phone',
        'email',
        'logo',
        'bir_permit',
        'business_permit',
        'fsic_permit',
        'doe_lpg_license',
        'lto_permit',
        'status',
        'subscription_plan',
        'subscription_started_at',
        'subscription_expires_at',
        'trial_used_at',
        'plan_reminder_sent_on',
        'plan_expired_notified_at',
        'is_featured',
        'approved_at',
        'approved_by',
        'suspension_reason',
        'suspension_notes',
        'suspended_at',
        'suspended_by',
        'latitude',
        'longitude',
        'attendance_radius',
        'max_delivery_radius_km',
        'allow_cod',
        'allow_consignment',
        'allow_pickup',
        'pickup_instructions',
        'min_down_payment_percent',
        'consignment_due_days',
        'business_permit_expires_at',
        'fsic_permit_expires_at',
        'doe_lpg_license_expires_at',
        'lto_permit_expires_at',
        'documents_suspended',
        'documents_suspended_at',
    ];

    protected function casts(): array
    {
        return [
            'is_featured'              => 'boolean',
            'approved_at'              => 'datetime',
            'subscription_started_at'  => 'datetime',
            'subscription_expires_at'  => 'datetime',
            'trial_used_at'            => 'datetime',
            'plan_reminder_sent_on'    => 'date',
            'plan_expired_notified_at' => 'datetime',
            'latitude'                 => 'decimal:7',
            'longitude'                => 'decimal:7',
            'attendance_radius'        => 'integer',
            'max_delivery_radius_km'   => 'integer',
            'business_permit_expires_at' => 'date',
            'fsic_permit_expires_at'     => 'date',
            'doe_lpg_license_expires_at' => 'date',
            'lto_permit_expires_at'      => 'date',
            'documents_suspended'        => 'boolean',
            'documents_suspended_at'     => 'datetime',
            'allow_cod'                => 'boolean',
            'allow_consignment'        => 'boolean',
            'allow_pickup'             => 'boolean',
            'min_down_payment_percent' => 'integer',
            'consignment_due_days'     => 'integer',
        ];
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    /**
     * Approved, not hidden for an expired permit, on an active plan (trial or paid), with at least one rider who
     * can deliver AND a vehicle that can take a delivery (with a delivery fee) — safe to show to customers.
     * Keep in step with isOpenToCustomers().
     */
    public function scopeVisibleToCustomers(\Illuminate\Database\Eloquent\Builder $query): \Illuminate\Database\Eloquent\Builder
    {
        return $query->where('stores.status', 'approved')->where('stores.documents_suspended', false)
            ->where('stores.subscription_plan', '!=', 'none')
            ->whereNotNull('stores.subscription_expires_at')
            ->where('stores.subscription_expires_at', '>', now())
            ->whereHas('eligibleRiders')
            ->whereHas('deliveryReadyVehicles');
    }

    /**
     * Riders who can deliver: active, not paused by the plan, with an approved driver's license that is still valid
     * (same rule as StaffDocumentService::canDeliver — licenseInfo step 1). Soft-deleted users are excluded by User.
     */
    public function eligibleRiders(): HasMany
    {
        return $this->hasMany(User::class, 'store_id')
            ->where('users.role', 'seller_staff')->where('users.sub_role', 'rider')
            ->where('users.is_active', true)->where('users.paused_by_plan', false)
            ->whereExists(fn ($q) => $q->select(\Illuminate\Support\Facades\DB::raw(1))->from('staff_documents')
                ->whereColumn('staff_documents.user_id', 'users.id')
                ->where('staff_documents.doc_type', 'drivers_license')
                ->where('staff_documents.status', 'approved')
                // expires_at is a DATE: plain string comparison keeps the index usable
                ->where('staff_documents.expires_at', '>=', \App\Services\StaffDocumentService::today()->toDateString()));
    }

    /** At least one rider who can deliver (memoized for this model instance — safe in long-running workers). */
    public function hasEligibleRider(): bool
    {
        return once(fn () => $this->eligibleRiders()->exists());
    }

    /**
     * Vehicles that can take a delivery: not deleted, available / in use, not paused by the plan, AND the store has a
     * delivery fee for that vehicle type. Same rule as DeliveryFeeService::usableVehicles() + a rate ("priced") —
     * keep both in step.
     */
    public function deliveryReadyVehicles(): HasMany
    {
        return $this->hasMany(Vehicle::class)
            ->whereIn('vehicles.status', ['available', 'in_use'])
            ->where('vehicles.paused_by_plan', false)
            ->whereExists(fn ($q) => $q->select(\Illuminate\Support\Facades\DB::raw(1))->from('store_delivery_rates')
                ->whereColumn('store_delivery_rates.store_id', 'vehicles.store_id')
                ->whereColumn('store_delivery_rates.vehicle_type', 'vehicles.vehicle_type'));
    }

    /** At least one delivery-ready vehicle (memoized for this model instance). */
    public function hasDeliveryReadyVehicle(): bool
    {
        return once(fn () => $this->deliveryReadyVehicles()->exists());
    }

    public static function visibilityCacheKey(int $storeId): string
    {
        return "store-visibility:{$storeId}";
    }

    /** Drop the cached "is my store visible" banner data (rider / license / staff / plan changes). */
    public static function forgetVisibilityCache(?int $storeId): void
    {
        if ($storeId) {
            \Illuminate\Support\Facades\Cache::forget(static::visibilityCacheKey($storeId));
        }
    }

    /**
     * Why customers can't see this store (empty when visible). Codes: plan, documents, no_rider, riders_inactive,
     * license_pending, license_expired, license_rejected, license_missing, no_vehicle, vehicles_unavailable,
     * no_delivery_fee. Rider reasons carry the rider to open.
     *
     * @return array{visible: bool, reasons: array<int, array{code: string, text: string, rider_id: ?int}>}
     */
    public function visibility(): array
    {
        $reasons = [];
        if ($this->documents_suspended) {
            $reasons[] = ['code' => 'documents', 'text' => 'A store document expired', 'rider_id' => null];
        }
        if (! \App\Services\SubscriptionService::isActive($this)) {
            $reasons[] = ['code' => 'plan', 'text' => 'Your plan has ended', 'rider_id' => null];
        }
        if (! $this->hasEligibleRider()) {
            $reasons[] = $this->riderReason();
        }
        if (! $this->hasDeliveryReadyVehicle()) {
            $reasons[] = $this->vehicleReason();
        }

        return ['visible' => $this->status === 'approved' && $reasons === [], 'reasons' => $reasons];
    }

    /** Why no vehicle can take a delivery (same branches as DeliveryFeeService::whyNoVehicleCode). */
    private function vehicleReason(): array
    {
        return match (\App\Services\DeliveryFeeService::whyNoVehicleCode($this, 0, 0)) {
            'no_vehicle'           => ['code' => 'no_vehicle', 'text' => 'No delivery vehicle yet', 'rider_id' => null],
            'vehicles_unavailable' => ['code' => 'vehicles_unavailable', 'text' => 'Your vehicles are in maintenance or paused', 'rider_id' => null],
            default                => ['code' => 'no_delivery_fee', 'text' => 'Set the delivery fee for your vehicle type', 'rider_id' => null],
        };
    }

    /** The most useful rider problem to fix first. */
    private function riderReason(): array
    {
        $riders = User::where('store_id', $this->id)->where('role', 'seller_staff')->where('sub_role', 'rider')->orderBy('id')->get();
        if ($riders->isEmpty()) {
            return ['code' => 'no_rider', 'text' => 'No rider yet', 'rider_id' => null];
        }
        $active = $riders->filter(fn (User $r) => $r->is_active && ! $r->paused_by_plan);
        if ($active->isEmpty()) {
            return ['code' => 'riders_inactive', 'text' => 'Your riders are deactivated or paused', 'rider_id' => $riders->first()->id];
        }
        $license = \App\Services\StaffDocumentService::forRiders($active);
        foreach ([
            'pending'  => "Your rider's driver's license is waiting for your approval",
            'expired'  => "Your rider's license expired",
            'rejected' => "Your rider's license was rejected",
            'missing'  => "Your rider hasn't uploaded a driver's license",
        ] as $status => $text) {
            if ($rider = $active->first(fn (User $r) => ($license[$r->id]['license_status'] ?? null) === $status)) {
                return ['code' => "license_{$status}", 'text' => $text, 'rider_id' => $rider->id];
            }
        }

        return ['code' => 'license_missing', 'text' => "Your rider hasn't uploaded a driver's license", 'rider_id' => $active->first()->id];
    }

    public function loyaltySettings(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(StoreLoyaltySettings::class);
    }

    public function customerLoyalties(): HasMany
    {
        return $this->hasMany(CustomerLoyalty::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    protected static function booted(): void
    {
        // Every new store starts with the 4 starter staff roles (Cashier, Warehouse, Rider, HR)
        static::created(fn (Store $store) => \App\Services\StoreRoleService::seedStarters($store));

        // Newly approved stores start with the default chat quick replies
        static::saved(function (Store $store) {
            if ($store->status === 'approved' && ($store->wasRecentlyCreated || $store->wasChanged('status'))) {
                try {
                    StoreQuickReply::ensureDefaults($store->id);
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('Default quick replies failed', ['store_id' => $store->id, 'error' => $e->getMessage()]);
                }
            }
        });
    }

    /**
     * Customers can message the store. No plan rule here: customers must still reach an expired store
     * about orders that are in progress.
     */
    public function canReceiveMessages(): bool
    {
        return $this->status === 'approved' && ! $this->documents_suspended;
    }

    /** Approved, not hidden for an expired permit, on an active plan, with a rider who can deliver and a delivery-ready vehicle. */
    public function isOpenToCustomers(): bool
    {
        return $this->status === 'approved' && ! $this->documents_suspended
            && \App\Services\SubscriptionService::isActive($this)
            && $this->hasEligibleRider()
            && $this->hasDeliveryReadyVehicle();
    }

    public function documentSubmissions(): HasMany
    {
        return $this->hasMany(StoreDocumentSubmission::class);
    }

    /** Platform admin who approved this store */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** All users (seller_staff) that belong to this store */
    public function staff(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    /** Delivery fee per vehicle type (DeliveryFeeService). */
    public function deliveryRates(): HasMany
    {
        return $this->hasMany(StoreDeliveryRate::class);
    }

    public function vehicles(): HasMany
    {
        return $this->hasMany(Vehicle::class);
    }

    /** A cash payment recorded by the admin that the owner has not accepted / declined yet */
    public function awaitingCashRequest(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        // At most one waits per store (recordCash refuses a second one)
        return $this->hasOne(SubscriptionPayment::class)->where('status', 'awaiting_seller');
    }

    public function subscriptionPayments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function verificationRequests(): HasMany
    {
        return $this->hasMany(VerificationRequest::class, 'user_id', 'user_id');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    public function ratings(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Rating::class);
    }
}
