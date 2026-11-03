<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\ManagesCoupons;
use App\Http\Controllers\Controller;
use App\Models\Coupon;
use App\Services\CouponService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** A seller's own store coupons — the store pays for the discount. */
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

        return Inertia::render('seller/coupons', [
            'coupons'         => $this->couponList(Coupon::with('store')->where('type', 'store')->where('store_id', $store->id), $request),
            'filters'         => $request->only('search'),
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

    public function destroy(Request $request, Coupon $coupon): RedirectResponse
    {
        $this->own($request, $coupon);

        $coupon->delete();

        return back()->with('success', "Coupon {$coupon->code} deleted.");
    }
}
