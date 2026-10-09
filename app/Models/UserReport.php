<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A report from a customer (about a store / rider / product), a store (about a customer) or a
 * rider (about a customer). `route` decides who handles it — see config/reports.php and
 * App\Services\ReportService (all rules live there). reported_store_id is always the store involved.
 */
class UserReport extends Model
{
    use SoftDeletes;

    public const PENDING     = 'pending';
    public const IN_PROGRESS   = 'under_review';            // "Under Review"
    public const INVESTIGATING = 'investigating';           // "Investigating"
    public const AWAITING      = 'awaiting_confirmation';   // "Resolution": a fix was proposed, waiting for the reporter
    public const SYSTEM_TYPE   = 'system_report';           // "Report a website problem" (admin only)
    public const RESOLVED    = 'resolved';
    public const DISMISSED   = 'dismissed';

    protected $fillable = [
        'reporter_id',
        'reported_id',
        'reported_store_id',
        'reported_customer_id',
        'reported_rider_id',
        'reported_product_id',
        'order_id',
        'type',
        'reporter_side',
        'target_type',
        'category',
        'route',
        'is_urgent',
        'subject',
        'description',
        'evidence_paths',
        'status',
        'waiting_on',
        'admin_notes',
        'resolution',
        'resolved_at',
        'resolved_by',
        'store_assigned_at',
        'escalated_at',
        'escalation_source',
        'escalation_reason',
        'store_first_response_at',
        'store_marked_fixed_at',
        'reporter_confirmed_at',
        'last_activity_at',
        'verdict',
        'verdict_by',
        'verdict_at',
        'resolution_photos',
        'system_area',
        'page_url',
        'user_agent',
        'store_reminded_at',
        'resolution_proposed_at',
        'admin_idle_alert_sent_at',
    ];

    protected $casts = [
        'evidence_paths'          => 'array',
        'is_urgent'               => 'boolean',
        'resolved_at'             => 'datetime',
        'store_assigned_at'       => 'datetime',
        'escalated_at'            => 'datetime',
        'store_first_response_at' => 'datetime',
        'store_marked_fixed_at'   => 'datetime',
        'reporter_confirmed_at'   => 'datetime',
        'last_activity_at'        => 'datetime',
        'resolution_photos'       => 'array',
        'verdict_at'              => 'datetime',
        'store_reminded_at'       => 'datetime',
        'resolution_proposed_at'  => 'datetime',
        'admin_idle_alert_sent_at' => 'datetime',
    ];

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id')->withTrashed();
    }

    public function reported(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_id')->withTrashed();
    }

    public function reportedStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'reported_store_id')->withTrashed();
    }

    public function reportedCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'reported_customer_id')->withTrashed();
    }

    public function reportedRider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_rider_id')->withTrashed();
    }

    public function reportedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'reported_product_id')->withTrashed();
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class)->withTrashed();
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by')->withTrashed();
    }

    public function updates(): HasMany
    {
        return $this->hasMany(ReportUpdate::class)->orderBy('id');
    }

    public function isClosed(): bool
    {
        return in_array($this->status, [self::RESOLVED, self::DISMISSED], true);
    }

    /** "Report a website problem" — admin only, no store, no order. */
    public function isSystem(): bool
    {
        return $this->type === self::SYSTEM_TYPE;
    }

    public function isEscalated(): bool
    {
        return $this->escalated_at !== null;
    }

    /** This category's settings from config/reports.php (null for old categories). */
    public function categoryConfig(): ?array
    {
        return $this->isSystem()
            ? config("reports.system_categories.{$this->category}")
            : config("reports.categories.{$this->category}");
    }

    public function categoryLabel(): string
    {
        return $this->categoryConfig()['label']
            ?? config("reports.legacy_labels.{$this->category}")
            ?? ucfirst(str_replace('_', ' ', (string) $this->category));
    }
}
