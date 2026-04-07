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
        'subscription_expires_at',
        'commission_rate',
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
    ];

    protected function casts(): array
    {
        return [
            'commission_rate'          => 'decimal:2',
            'delivery_fee'             => 'decimal:2',
            'is_featured'              => 'boolean',
            'approved_at'              => 'datetime',
            'subscription_expires_at'  => 'datetime',
            'latitude'                 => 'decimal:7',
            'longitude'                => 'decimal:7',
            'attendance_radius'        => 'integer',
            'base_delivery_fee'        => 'decimal:2',
            'fee_per_km'               => 'decimal:2',
            'max_delivery_radius_km'   => 'integer',
        ];
    }

    // ── Relationships ─────────────────────────────────────────────────────────

    /** The seller/owner of this store */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
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

    public function subscriptions(): HasMany
    {
        return $this->hasMany(StoreSubscription::class);
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

    public function isPremium(): bool
    {
        return $this->subscription_plan === 'premium';
    }

    public function isPremiumActive(): bool
    {
        return $this->isPremium()
            && ($this->subscription_expires_at === null || $this->subscription_expires_at->isFuture());
    }

    public function ratings(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Rating::class);
    }
}
