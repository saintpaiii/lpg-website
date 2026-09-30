<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Concerns\ManagesCoupons;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Coupon;
use App\Models\CouponUse;
use App\Models\Order;
use App\Models\Setting;
use App\Models\Store;
use App\Services\CouponService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Platform-wide coupons. The discount cost is shared: the platform covers
 * admin_share_percent of it (credited against the store's commission) and
 * participating stores pay a reduced promo commission rate.
 */
class CouponController extends Controller
{
    use ManagesCoupons;

    public function index(Request $request): Response
    {
        return Inertia::render('admin/coupons', [
            'coupons'         => $this->couponList(Coupon::with('store')->where('type', 'platform'), $request),
            'filters'         => $request->only('search'),
            'commission_rate' => (float) Setting::get('default_commission_rate', Commission::DEFAULT_RATE),
            'suggested_code'  => Coupon::generateCode('LPG'),
        ]);
    }

    public function show(Coupon $coupon): Response
    {
        abort_unless($coupon->type === 'platform', 404);

        $uses = CouponUse::with(['order.items', 'order.store', 'order.customer', 'user'])
            ->where('coupon_id', $coupon->id)
            ->whereHas('order', fn ($q) => $q->where('status', '!=', 'cancelled'))
            ->latest('id')
            ->get();

        // Commission the platform gave up vs. charging the store's normal rate on the original price
        $commissionWaived = $uses->sum(function (CouponUse $u) {
            $order  = $u->order;
            $base   = (float) $order->items->sum('subtotal') - (float) $order->discount_amount;
            $normal = (float) ($order->store?->commission_rate ?: Commission::DEFAULT_RATE);
            $promo  = (float) ($u->commission_rate ?? $normal);
            return max(0, $base * ($normal - $promo) / 100);
        });

        $orderIds = $uses->pluck('order_id')->unique();
        $customerIds = $uses->pluck('order.customer_id')->unique()->filter();
        // Customers whose first-ever order used this coupon
        $newCustomers = $customerIds->filter(function ($cid) use ($orderIds) {
            $first = Order::where('customer_id', $cid)->orderBy('id')->value('id');
            return $orderIds->contains($first);
        })->count();

        $excluded = $coupon->exclusions()->with('store')->latest('excluded_at')->get();
        $approved = Store::where('status', 'approved')->orderBy('store_name')->get(['id', 'store_name']);
        $excludedIds = $excluded->pluck('store_id')->all();

        $coupon->loadCount(['exclusions', 'orders as orders_count' => fn ($q) => $q->where('status', '!=', 'cancelled')]);

        return Inertia::render('admin/coupon-show', [
            'coupon' => $this->formatCoupon($coupon),
            'stats'  => [
                'checkouts'         => $uses->pluck('checkout_ref')->unique()->count(),
                'orders'            => $orderIds->count(),
                'new_customers'     => $newCustomers,
                'revenue'           => round($uses->sum(fn ($u) => $u->order->grandTotal()), 2),
                'discount_given'    => round((float) $uses->sum('discount_applied'), 2),
                'admin_absorbed'    => round((float) $uses->sum('admin_absorbed'), 2),
                'seller_absorbed'   => round((float) $uses->sum('seller_absorbed'), 2),
                'commission_waived' => round($commissionWaived, 2),
            ],
            'participating' => $approved->reject(fn ($s) => in_array($s->id, $excludedIds))
                ->map(fn ($s) => ['id' => $s->id, 'store_name' => $s->store_name])->values(),
            'excluded' => $excluded->map(fn ($e) => [
                'store_name'  => $e->store?->store_name,
                'excluded_at' => $e->excluded_at?->format('M d, Y g:i A'),
            ])->values(),
            'uses' => $uses->take(50)->map(fn (CouponUse $u) => [
                'id'              => $u->id,
                'order_id'        => $u->order_id,
                'order_number'    => $u->order?->order_number,
                'store_name'      => $u->order?->store?->store_name,
                'customer_name'   => $u->order?->customer?->name ?? $u->user?->name,
                'discount'        => (float) $u->discount_applied,
                'admin_absorbed'  => (float) $u->admin_absorbed,
                'seller_absorbed' => (float) $u->seller_absorbed,
                'commission_rate' => $u->commission_rate !== null ? (float) $u->commission_rate : null,
                'status'          => $u->order?->status,
                'created_at'      => $u->created_at?->format('M d, Y g:i A'),
            ])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate($this->couponRules($request), $this->couponMessages());

        $coupon = Coupon::create($this->couponAttributes($data) + $this->platformAttributes($data) + [
            'type'       => 'platform',
            'store_id'   => null,
            'created_by' => $request->user()->id,
        ]);

        CouponService::announce($coupon);

        return back()->with('success', "Coupon {$coupon->code} created" . ($coupon->is_active ? '. Customers and sellers were notified.' : '.'));
    }

    public function update(Request $request, Coupon $coupon): RedirectResponse
    {
        abort_unless($coupon->type === 'platform', 404);

        $data = $request->validate($this->couponRules($request, $coupon), $this->couponMessages());
        $coupon->update($this->couponAttributes($data) + $this->platformAttributes($data));

        return back()->with('success', "Coupon {$coupon->code} updated. Orders already placed keep the terms they were placed with.");
    }

    public function toggle(Coupon $coupon): RedirectResponse
    {
        abort_unless($coupon->type === 'platform', 404);

        $coupon->update(['is_active' => ! $coupon->is_active]);

        return back()->with('success', "Coupon {$coupon->code} " . ($coupon->is_active ? 'activated.' : 'deactivated.'));
    }

    public function destroy(Coupon $coupon): RedirectResponse
    {
        abort_unless($coupon->type === 'platform', 404);

        $coupon->delete();

        return redirect('/admin/coupons')->with('success', "Coupon {$coupon->code} deleted.");
    }
}
