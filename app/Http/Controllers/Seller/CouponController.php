<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\ManagesCoupons;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\Coupon;
use App\Models\CouponStoreExclusion;
use App\Services\NotificationService;
use App\Services\CouponService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** A seller's own store coupons. Commission is still charged on the original price. */
class CouponController extends Controller
{
    use ManagesCoupons;

    private function own(Request $request, Coupon $coupon): Coupon
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($coupon->type === 'store' && $coupon->store_id === $store->id, 404);

        return $coupon;
    }

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        $normalRate = (float) ($store->commission_rate ?: Commission::DEFAULT_RATE);

        return Inertia::render('seller/coupons', [
            'tab'             => $request->get('tab', 'mine') === 'platform' ? 'platform' : 'mine',
            'promotions'      => $this->platformPromotions($store, $normalRate),
            'coupons'         => $this->couponList(Coupon::with('store')->where('type', 'store')->where('store_id', $store->id), $request),
            'filters'         => $request->only('search'),
            'commission_rate' => (float) ($store->commission_rate ?: Commission::DEFAULT_RATE),
            'suggested_code'  => Coupon::generateCode(strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $store->store_name), 0, 4)) ?: 'SHOP'),
            'customers_count' => count(CouponService::storeCustomerUserIds($store->id)),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        $data  = $request->validate($this->couponRules($request), $this->couponMessages());

        $coupon = Coupon::create($this->couponAttributes($data) + [
            'type'                => 'store',
            'store_id'            => $store->id,
            'admin_share_percent' => 0,     // store coupons are funded by the store
            'featured_boost'      => false,
            'created_by'          => $request->user()->id,
        ]);

        CouponService::announce($coupon->load('store'));

        return back()->with('success', "Coupon {$coupon->code} created" . ($coupon->is_active ? ' and your past customers were notified.' : '.'));
    }

    public function update(Request $request, Coupon $coupon): RedirectResponse
    {
        $this->own($request, $coupon);

        $data = $request->validate($this->couponRules($request, $coupon), $this->couponMessages());
        $coupon->update($this->couponAttributes($data));

        return back()->with('success', "Coupon {$coupon->code} updated.");
    }

    public function toggle(Request $request, Coupon $coupon): RedirectResponse
    {
        $this->own($request, $coupon);

        $coupon->update(['is_active' => ! $coupon->is_active]);

        return back()->with('success', "Coupon {$coupon->code} " . ($coupon->is_active ? 'activated.' : 'deactivated.'));
    }

    /** Opt the store in or out of a platform promotion. */
    public function participation(Request $request, Coupon $coupon): RedirectResponse
    {
        abort_unless($coupon->type === 'platform', 404);

        $store = $request->attributes->get('seller_store');
        $data  = $request->validate(['participate' => 'required|boolean']);

        if ($data['participate']) {
            CouponStoreExclusion::where('coupon_id', $coupon->id)->where('store_id', $store->id)->delete();

            return back()->with('success', "You're participating in {$coupon->code} again.");
        }

        CouponStoreExclusion::firstOrCreate(
            ['coupon_id' => $coupon->id, 'store_id' => $store->id],
            ['excluded_at' => now()]
        );

        NotificationService::sendToRole('platform_admin', 'promo', 'Store Opted Out of Promotion',
            "{$store->store_name} opted out of the {$coupon->code} promotion.",
            ['coupon_id' => $coupon->id, 'link' => '/admin/coupons/' . $coupon->id]);

        return back()->with('success', "You've opted out of {$coupon->code}. Your products won't be eligible for it.");
    }

    /** Running + upcoming platform coupons with this store's terms and participation. */
    private function platformPromotions($store, float $normalRate): array
    {
        $excluded = CouponStoreExclusion::where('store_id', $store->id)->pluck('coupon_id')->all();

        return Coupon::runningPlatform(includeScheduled: true)
            ->withSum(['uses as store_discount' => fn ($q) => $q->whereHas('order', fn ($o) => $o->where('store_id', $store->id)->where('status', '!=', 'cancelled'))], 'discount_applied')
            ->withSum(['uses as store_cost' => fn ($q) => $q->whereHas('order', fn ($o) => $o->where('store_id', $store->id)->where('status', '!=', 'cancelled'))], 'seller_absorbed')
            ->withCount(['uses as store_orders' => fn ($q) => $q->whereHas('order', fn ($o) => $o->where('store_id', $store->id)->where('status', '!=', 'cancelled'))])
            ->orderBy('expires_at')
            ->get()
            ->map(fn (Coupon $c) => [
                'id'                  => $c->id,
                'code'                => $c->code,
                'label'               => $c->label(),
                'scope'               => $c->scope,
                'discount_type'       => $c->discount_type,
                'discount_value'      => (float) $c->discount_value,
                'min_order_amount'    => (float) $c->min_order_amount,
                'max_discount_amount' => $c->max_discount_amount !== null ? (float) $c->max_discount_amount : null,
                'admin_share_percent' => (int) $c->admin_share_percent,
                'promo_rate'          => CouponService::promoCommissionRate($c, $normalRate),
                'normal_rate'         => $normalRate,
                'featured_boost'      => (bool) $c->featured_boost,
                'starts_at'           => $c->starts_at?->format('M d, Y'),
                'expires_at'          => $c->expires_at?->format('M d, Y'),
                'state'               => $c->state(),
                'participating'       => ! in_array($c->id, $excluded),
                'my_orders'           => (int) ($c->store_orders ?? 0),
                'my_discount'         => round((float) ($c->store_discount ?? 0), 2),
                'my_cost'             => round((float) ($c->store_cost ?? 0), 2),
            ])->values()->all();
    }

    public function destroy(Request $request, Coupon $coupon): RedirectResponse
    {
        $this->own($request, $coupon);

        $coupon->delete();

        return back()->with('success', "Coupon {$coupon->code} deleted.");
    }
}
