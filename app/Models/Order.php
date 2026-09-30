<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id',
        'order_number',
        'customer_id',
        'transaction_type',
        'status',
        'total_amount',
        'shipping_fee',
        'platform_fee',
        'payment_method',
        'payment_status',
        'notes',
        'cancellation_reason',
        'cancellation_notes',
        'cancelled_by',
        'cancelled_at',
        'ordered_at',
        'delivered_at',
        'loyalty_recorded_at',
        'created_by',
        'payment_mode',
        'down_payment_amount',
        'remaining_balance',
        'balance_due_date',
        'balance_reminder_sent_at',
        'balance_overdue_notified_at',
        'discount_amount',
        'coupon_id',
        'coupon_discount',
        'delivery_latitude',
        'delivery_longitude',
        'delivery_distance_km',
        'estimated_delivery_minutes',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'shipping_fee' => 'decimal:2',
            'platform_fee' => 'decimal:2',
            'ordered_at'           => 'datetime',
            'delivered_at'         => 'datetime',
            'loyalty_recorded_at'  => 'datetime',
            'cancelled_at'         => 'datetime',
            'down_payment_amount'  => 'decimal:2',
            'remaining_balance'    => 'decimal:2',
            'discount_amount'      => 'decimal:2',
            'coupon_discount'      => 'decimal:2',
            'balance_due_date'            => 'date',
            'balance_reminder_sent_at'    => 'datetime',
            'balance_overdue_notified_at' => 'datetime',
            'delivery_latitude'           => 'decimal:7',
            'delivery_longitude'          => 'decimal:7',
            'delivery_distance_km'        => 'decimal:2',
            'estimated_delivery_minutes'  => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class);
    }

    public function invoice(): HasOne
    {
        return $this->hasOne(Invoice::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class)->withTrashed();
    }

    public function commission(): HasOne
    {
        return $this->hasOne(Commission::class);
    }

    public function refundRequests(): HasMany
    {
        return $this->hasMany(RefundRequest::class);
    }

    /** Amount the customer owes in total (items after discount + delivery fee). */
    public function grandTotal(): float
    {
        return round((float) $this->total_amount + (float) ($this->shipping_fee ?? 0), 2);
    }

    /**
     * Full price breakdown for detail pages and invoices. Rows always add up to
     * grandTotal() — the amount the customer pays (and the rider collects on COD).
     *
     * total_amount is stored after the product part of any discount and
     * shipping_fee after the delivery part of a coupon, so the coupon's split is
     * derived from the item subtotals.
     */
    public function priceBreakdown(): array
    {
        $this->loadMissing(['items', 'coupon']);

        $total          = (float) $this->total_amount;
        $shipping       = (float) ($this->shipping_fee ?? 0);
        $storeDiscount  = (float) ($this->discount_amount ?? 0);
        $couponDiscount = (float) ($this->coupon_discount ?? 0);
        $itemsSum       = (float) $this->items->sum('subtotal');

        $couponOnItems    = $couponDiscount > 0
            ? round(min($couponDiscount, max(0, $itemsSum - $storeDiscount - $total)), 2)
            : 0.0;
        $couponOnDelivery = round($couponDiscount - $couponOnItems, 2);

        return [
            'subtotal'           => round($total + $storeDiscount + $couponOnItems, 2),
            'delivery_fee'       => round($shipping + $couponOnDelivery, 2),
            'store_discount'     => round($storeDiscount, 2),
            'coupon_code'        => $couponDiscount > 0 ? $this->coupon?->code : null,
            'coupon_discount'    => round($couponDiscount, 2),
            'coupon_on_delivery' => $couponOnDelivery,
            'grand_total'        => $this->grandTotal(),
        ];
    }

    /** Consignment order with an unpaid balance that is past its due date. */
    public function isBalanceOverdue(): bool
    {
        return $this->payment_mode === 'consignment'
            && $this->payment_status === 'partial'
            && $this->balance_due_date !== null
            && $this->balance_due_date->lt(now()->startOfDay());
    }
}
