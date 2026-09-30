<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Per-store loyalty program configuration (seller opt-in). */
class StoreLoyaltySettings extends Model
{
    use SoftDeletes;

    protected $table = 'store_loyalty_settings';

    public const DEFAULTS = [
        'is_enabled'                      => false,
        'regular_threshold'               => 8,
        'loyal_threshold'                 => 15,
        'vip_threshold'                   => 25,
        'new_downpayment_percent'         => 60,
        'regular_downpayment_percent'     => 50,
        'loyal_downpayment_percent'       => 40,
        'vip_downpayment_percent'         => 30,
        'min_trust_score_for_consignment' => 40.00,
        'inactivity_days'                 => 90,
    ];

    protected $fillable = [
        'store_id',
        'is_enabled',
        'regular_threshold',
        'loyal_threshold',
        'vip_threshold',
        'new_downpayment_percent',
        'regular_downpayment_percent',
        'loyal_downpayment_percent',
        'vip_downpayment_percent',
        'min_trust_score_for_consignment',
        'inactivity_days',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled'                      => 'boolean',
            'regular_threshold'               => 'integer',
            'loyal_threshold'                 => 'integer',
            'vip_threshold'                   => 'integer',
            'new_downpayment_percent'         => 'integer',
            'regular_downpayment_percent'     => 'integer',
            'loyal_downpayment_percent'       => 'integer',
            'vip_downpayment_percent'         => 'integer',
            'min_trust_score_for_consignment' => 'decimal:2',
            'inactivity_days'                 => 'integer',
        ];
    }

    /** Validation rules for the settings form (ordering rules are checked in the controller). */
    public static function rules(): array
    {
        return [
            'regular_threshold'               => 'required|integer|min:3|max:50',
            'loyal_threshold'                 => 'required|integer|min:5|max:100',
            'vip_threshold'                   => 'required|integer|min:10|max:200',
            'new_downpayment_percent'         => 'required|integer|min:20|max:80',
            'regular_downpayment_percent'     => 'required|integer|min:20|max:80',
            'loyal_downpayment_percent'       => 'required|integer|min:20|max:80',
            'vip_downpayment_percent'         => 'required|integer|min:20|max:80',
            'min_trust_score_for_consignment' => 'required|numeric|min:0|max:100',
            'inactivity_days'                 => 'required|integer|min:30|max:365',
        ];
    }

    /** Settings row for a store, created with defaults (disabled) if missing. */
    public static function forStore(int $storeId): self
    {
        return static::firstOrCreate(['store_id' => $storeId], static::DEFAULTS);
    }

    /** Next tier and the order count needed to reach it (null at VIP). */
    public function nextTier(string $tier): ?array
    {
        return match ($tier) {
            'new'     => ['tier' => 'regular', 'threshold' => $this->regular_threshold],
            'regular' => ['tier' => 'loyal', 'threshold' => $this->loyal_threshold],
            'loyal'   => ['tier' => 'vip', 'threshold' => $this->vip_threshold],
            default   => null,
        };
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
