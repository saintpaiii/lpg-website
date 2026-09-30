<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Coupon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Shared create/update validation and listing for admin (platform) and seller (store) coupons. */
trait ManagesCoupons
{
    protected function couponRules(Request $request, ?Coupon $coupon = null): array
    {
        $isPct = $request->input('discount_type') === 'percentage';

        return [
            'code'                => ['required', 'string', 'min:3', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/',
                Rule::unique('coupons', 'code')->ignore($coupon?->id)],
            'scope'               => 'required|in:product,shipping,both',
            'discount_type'       => 'required|in:percentage,fixed',
            'discount_value'      => ['required', 'numeric', 'min:0.01', $isPct ? 'max:100' : 'max:999999'],
            'min_order_amount'    => 'nullable|numeric|min:0',
            'max_discount_amount' => 'nullable|numeric|min:0.01',
            'max_uses'            => 'nullable|integer|min:1',
            'max_uses_per_user'   => 'required|integer|min:1|max:1000',
            'starts_at'           => 'nullable|date',
            // Only compare to starts_at when one was given (otherwise the rule parses the literal "starts_at")
            'expires_at'          => array_filter(['nullable', 'date',
                $request->filled('starts_at') ? 'after_or_equal:starts_at' : ($coupon ? null : 'after_or_equal:today')]),
            'is_active'           => 'boolean',
            // Cost sharing — only used for platform coupons
            'admin_share_percent'            => 'nullable|integer|min:0|max:100',
            'seller_commission_during_promo' => 'nullable|numeric|min:0|max:100',
            'featured_boost'                 => 'boolean',
        ];
    }

    protected function couponMessages(): array
    {
        return [
            'code.regex'  => 'Use letters, numbers, dashes or underscores only.',
            'code.unique' => 'This code is already taken.',
        ];
    }

    /** Normalize validated input into model attributes. */
    protected function couponAttributes(array $data): array
    {
        return [
            'code'                => strtoupper($data['code']),
            'scope'               => $data['scope'],
            'discount_type'       => $data['discount_type'],
            'discount_value'      => $data['discount_value'],
            'min_order_amount'    => $data['min_order_amount'] ?? 0,
            'max_discount_amount' => $data['discount_type'] === 'percentage' ? ($data['max_discount_amount'] ?? null) : null,
            'max_uses'            => $data['max_uses'] ?? null,
            'max_uses_per_user'   => $data['max_uses_per_user'],
            'starts_at'           => ! empty($data['starts_at']) ? \Carbon\Carbon::parse($data['starts_at'])->startOfDay() : null,
            'expires_at'          => ! empty($data['expires_at']) ? \Carbon\Carbon::parse($data['expires_at'])->endOfDay() : null,
            'is_active'           => (bool) ($data['is_active'] ?? true),
        ];
    }

    /** Cost-sharing attributes for platform coupons. */
    protected function platformAttributes(array $data): array
    {
        return [
            'admin_share_percent'            => (int) ($data['admin_share_percent'] ?? 50),
            'seller_commission_during_promo' => isset($data['seller_commission_during_promo']) && $data['seller_commission_during_promo'] !== ''
                ? $data['seller_commission_during_promo'] : null,
            'featured_boost'                 => (bool) ($data['featured_boost'] ?? true),
        ];
    }

    /** Coupons with per-coupon stats (non-cancelled orders only). */
    protected function couponList(Builder $query, Request $request)
    {
        $active = fn ($q) => $q->where('status', '!=', 'cancelled');

        if ($s = $request->get('search')) {
            $query->where('code', 'like', '%' . strtoupper($s) . '%');
        }

        return $query
            ->withCount(['uses as uses_count'])
            ->withSum(['orders as discount_given' => $active], 'coupon_discount')
            ->withSum(['orders as revenue_items' => $active], 'total_amount')
            ->withSum(['orders as revenue_shipping' => $active], 'shipping_fee')
            ->withCount(['orders as orders_count' => $active])
            ->withCount('exclusions')
            ->withSum('uses as admin_absorbed_sum', 'admin_absorbed')
            ->withSum('uses as seller_absorbed_sum', 'seller_absorbed')
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Coupon $c) => $this->formatCoupon($c));
    }

    private ?int $approvedStores = null;

    protected function approvedStoreCount(): int
    {
        return $this->approvedStores ??= \App\Models\Store::where('status', 'approved')->count();
    }

    protected function formatCoupon(Coupon $c): array
    {
        return [
            'id'                  => $c->id,
            'code'                => $c->code,
            'type'                => $c->type,
            'store_name'          => $c->store?->store_name,
            'scope'               => $c->scope,
            'discount_type'       => $c->discount_type,
            'discount_value'      => (float) $c->discount_value,
            'min_order_amount'    => (float) $c->min_order_amount,
            'max_discount_amount' => $c->max_discount_amount !== null ? (float) $c->max_discount_amount : null,
            'max_uses'            => $c->max_uses,
            'max_uses_per_user'   => $c->max_uses_per_user,
            'used_count'          => $c->used_count,
            'starts_at'           => $c->starts_at?->toDateString(),
            'expires_at'          => $c->expires_at?->toDateString(),
            'is_active'           => $c->is_active,
            'admin_share_percent' => (int) $c->admin_share_percent,
            'seller_commission_during_promo' => $c->seller_commission_during_promo !== null ? (float) $c->seller_commission_during_promo : null,
            'featured_boost'      => (bool) $c->featured_boost,
            'participating_stores' => $c->type === 'platform'
                ? max(0, $this->approvedStoreCount() - (int) ($c->exclusions_count ?? 0))
                : null,
            'state'               => $c->state(),
            'label'               => $c->label(),
            'stats'               => [
                'orders'         => (int) ($c->orders_count ?? 0),
                'discount_given' => round((float) ($c->discount_given ?? 0), 2),
                'revenue'        => round((float) ($c->revenue_items ?? 0) + (float) ($c->revenue_shipping ?? 0), 2),
                'admin_absorbed' => round((float) ($c->admin_absorbed_sum ?? 0), 2),
                'seller_absorbed'=> round((float) ($c->seller_absorbed_sum ?? 0), 2),
            ],
            'created_at'          => $c->created_at->format('M d, Y'),
        ];
    }
}
