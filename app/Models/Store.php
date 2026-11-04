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
        'delivery_fee',
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
        'base_delivery_fee',
        'fee_per_km',
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
            'delivery_fee'             => 'decimal:2',
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
            'base_delivery_fee'        => 'decimal:2',
            'fee_per_km'               => 'decimal:2',
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
     * Approved, not hidden for an expired permit, and on an active plan (trial or paid) — safe to show to customers.
     * Keep in step with isOpenToCustomers().
     */
    public function scopeVisibleToCustomers(\Illuminate\Database\Eloquent\Builder $query): \Illuminate\Database\Eloquent\Builder
    {
        return $query->where('stores.status', 'approved')->where('stores.documents_suspended', false)
            ->where('stores.subscription_plan', '!=', 'none')
            ->whereNotNull('stores.subscription_expires_at')
            ->where('stores.subscription_expires_at', '>', now());
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

    /** Approved, not hidden for an expired permit, and on an active plan. */
    public function isOpenToCustomers(): bool
    {
        return $this->status === 'approved' && ! $this->documents_suspended
            && \App\Services\SubscriptionService::isActive($this);
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
