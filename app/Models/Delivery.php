<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Delivery extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'order_id',
        'rider_id',
        'vehicle_id',
        'status',
        'sequence',
        'batch_id',
        'notes',
        'assigned_at',
        'delivered_at',
        'fail_reason',
        'redeliver_on',
        'redeliver_until',
        'failed_at',
    ];

    public const ACTIVE_STATUSES = ['assigned', 'picked_up', 'in_transit'];

    /** Failure details, cleared whenever the delivery leaves 'failed' (reassigned, retried, …). */
    public const FAIL_FIELDS = ['fail_reason', 'redeliver_on', 'redeliver_until', 'failed_at'];

    protected function casts(): array
    {
        return [
            'assigned_at'  => 'datetime',
            'delivered_at' => 'datetime',
            'redeliver_on' => 'date',
            'redeliver_until' => 'date',
            'failed_at'    => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Every path that moves a failed delivery on (seller / admin / API reassign, batch routes, refunds)
        // drops the old failure details, so "Redelivery scheduled" never outlives the failure.
        static::saving(function (Delivery $d) {
            if ($d->isDirty('status') && $d->status !== 'failed') {
                foreach (self::FAIL_FIELDS as $field) {
                    $d->{$field} = null;
                }
            }
        });
    }

    /**
     * Rider may see the customer's phone / email while the delivery is active and for 24 hours after it ended.
     */
    public function customerContactVisible(): bool
    {
        if (in_array($this->status, self::ACTIVE_STATUSES, true)) {
            return true;
        }
        $endedAt = $this->status === 'delivered' ? $this->delivered_at : ($this->failed_at ?? $this->updated_at);

        return $endedAt !== null && $endedAt->gte(now()->subDay());
    }

    /** Options for the failed-delivery dialogs (page prop `fail_options`). */
    public static function failOptions(): array
    {
        return [
            'reasons'        => config('delivery.fail_reasons'),
            'no_redelivery'  => config('delivery.no_redelivery_reasons'),
            'max_start_days' => config('delivery.redeliver_max_start_days'),
            'max_range_days' => config('delivery.redeliver_max_range_days'),
        ];
    }

    public static function failReasonLabel(?string $key): ?string
    {
        return $key ? (config('delivery.fail_reasons')[$key] ?? null) : null;
    }

    public static function needsRedeliveryDate(?string $reason): bool
    {
        return ! in_array($reason, config('delivery.no_redelivery_reasons'), true);
    }

    /**
     * Validation rules for the failure details, used by the rider and seller status forms.
     * Only enforced when the new status is 'failed'. Redelivery is an estimated range:
     * redeliver_on (from) within the next 14 days, redeliver_until (to) at most 7 days after it.
     */
    public static function failureRules(\Illuminate\Http\Request $request): array
    {
        $failing   = $request->input('status') === 'failed';
        $reason    = $request->input('fail_reason');
        $needsDate = $failing && self::needsRedeliveryDate($reason);

        $maxStart = (int) config('delivery.redeliver_max_start_days');
        $maxRange = (int) config('delivery.redeliver_max_range_days');
        $untilMax = [];
        try {
            if ($from = $request->input('redeliver_on')) {
                $untilMax = ['before_or_equal:' . \Illuminate\Support\Carbon::parse($from)->addDays($maxRange)->toDateString()];
            }
        } catch (\Throwable) {
            // invalid "from" date — reported by its own 'date' rule
        }

        return [
            'fail_reason'     => [\Illuminate\Validation\Rule::requiredIf($failing), 'nullable', \Illuminate\Validation\Rule::in(array_keys(config('delivery.fail_reasons')))],
            'redeliver_on'    => [\Illuminate\Validation\Rule::requiredIf($needsDate), 'nullable', 'date', 'after_or_equal:today', "before_or_equal:+{$maxStart} days"],
            'redeliver_until' => [\Illuminate\Validation\Rule::requiredIf($needsDate), 'nullable', 'date', 'after_or_equal:redeliver_on', ...$untilMax],
            'notes'           => [\Illuminate\Validation\Rule::requiredIf($failing && $reason === 'other'), 'nullable', 'string', 'max:500'],
        ];
    }

    public static function failureMessages(): array
    {
        return [
            'fail_reason.required'            => 'Please choose why the delivery failed.',
            'redeliver_on.required'           => 'Please choose when we can deliver again.',
            'redeliver_on.after_or_equal'     => 'The redelivery date cannot be in the past.',
            'redeliver_on.before_or_equal'    => 'Please start the redelivery within the next ' . config('delivery.redeliver_max_start_days') . ' days.',
            'redeliver_until.required'        => 'Please choose the last day of the redelivery range.',
            'redeliver_until.after_or_equal'  => 'The "To" date cannot be before the "From" date.',
            'redeliver_until.before_or_equal' => 'The redelivery range can be at most ' . config('delivery.redeliver_max_range_days') . ' days.',
            'notes.required'                  => 'Please describe what happened.',
        ];
    }

    /** Columns to save with status 'failed' (one update, so the observer sees them). */
    public static function failureUpdates(array $data): array
    {
        $needsDate = self::needsRedeliveryDate($data['fail_reason'] ?? null);

        return [
            'fail_reason'     => $data['fail_reason'],
            'redeliver_on'    => $needsDate ? $data['redeliver_on'] : null,
            'redeliver_until' => $needsDate ? $data['redeliver_until'] : null,
            'failed_at'       => now(),
        ];
    }

    /** "Oct 31 – Nov 2", or "Oct 31" for a one-day range; null without a date. */
    public function redeliveryRangeLabel(string $separator = ' – '): ?string
    {
        if (! $this->redeliver_on) {
            return null;
        }
        $until = $this->redeliver_until;

        return $until && ! $until->isSameDay($this->redeliver_on)
            ? $this->redeliver_on->format('M j') . $separator . $until->format('M j')
            : $this->redeliver_on->format('M j');
    }

    /**
     * Failure details for the UI, only while the delivery is failed:
     * reason / reason_label, redeliver_on / redeliver_until (Y-m-d), range_label ("Oct 31 – Nov 2"),
     * short ("Redeliver Oct 31–Nov 2").
     */
    public function failInfo(): ?array
    {
        if ($this->status !== 'failed' || ! $this->fail_reason) {
            return null;
        }
        $range = $this->redeliveryRangeLabel();

        return [
            'reason'          => $this->fail_reason,
            'reason_label'    => self::failReasonLabel($this->fail_reason),
            'notes'           => $this->notes,
            'redeliver_on'    => $this->redeliver_on?->toDateString(),
            'redeliver_until' => ($this->redeliver_until ?? $this->redeliver_on)?->toDateString(),
            'range_label'     => $range,
            'short'           => $range ? 'Redeliver ' . $this->redeliveryRangeLabel('–') : null,
            'failed_at'       => $this->failed_at?->format('M d, Y g:i A'),
        ];
    }

    /** "Delivery of order X didn't push through: Reason. We'll try again between Oct 31 and Nov 2." (or "on Oct 31") */
    public function failureMessage(string $orderNumber): string
    {
        $text = "Delivery of order {$orderNumber} didn't push through: " . (self::failReasonLabel($this->fail_reason) ?? 'see the store for details') . '.';
        if ($this->redeliver_on) {
            $until = $this->redeliver_until;
            $text .= $until && ! $until->isSameDay($this->redeliver_on)
                ? " We'll try again between {$this->redeliver_on->format('M j')} and {$until->format('M j')}."
                : " We'll try again on {$this->redeliver_on->format('M j')}.";
        }

        return $text;
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rider_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function proofs(): HasMany
    {
        return $this->hasMany(DeliveryProof::class)->orderBy('created_at');
    }
}
