<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\BranchService;
use App\Services\SubscriptionService;
use App\Support\StoreContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * J9 — the owner's Branches page, the Add branch form and the store switcher. Owner only (seller_owner); adding a
 * branch needs the MAIN store on a paid Premium plan (plan.feature:branches on the store route).
 */
class BranchController extends Controller
{
    public function index(Request $request): Response
    {
        $owner = $request->user();
        $main = StoreContext::mainFor($owner);

        return Inertia::render('seller/branches', [
            'main'     => ['id' => $main->id, 'name' => $main->store_name, 'plan' => SubscriptionService::planName(SubscriptionService::currentKey($main))],
            'stores'   => BranchService::rows($owner),
            'canAdd'   => BranchService::canAdd($main),
            'blocker'  => BranchService::blocker($main),
            'trialDays'=> SubscriptionService::trialDays(),
        ]);
    }

    public function create(Request $request): Response
    {
        $main = StoreContext::mainFor($request->user());

        return Inertia::render('seller/branch-create', [
            'main' => [
                'id' => $main->id, 'name' => $main->store_name, 'city' => $main->city, 'province' => $main->province ?: 'Cavite',
                'exchange_policy' => \App\Support\ExchangePolicy::for($main),
                'delivery' => ['allow_cod' => (bool) $main->allow_cod, 'allow_pickup' => (bool) $main->allow_pickup,
                    'max_delivery_radius_km' => $main->max_delivery_radius_km, 'rates' => \App\Models\StoreDeliveryRate::where('store_id', $main->id)->count()],
                'products' => \App\Models\Product::where('store_id', $main->id)->where('is_active', true)->count(),
            ],
            'exchangeOptions' => ['brands' => \App\Support\ExchangePolicy::BRANDS, 'rules' => \App\Support\ExchangePolicy::RULES],
            'maxValidUntil'   => collect(BranchService::BRANCH_DOCS)->mapWithKeys(fn ($d) => [$d => \App\Support\StoreDocuments::maxValidUntil($d)]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $owner = $request->user();
        $main = StoreContext::mainFor($owner);
        if ($why = BranchService::blocker($main)) {
            return back()->with('error', $why);
        }
        $data = $request->validate(BranchService::rules($main), BranchService::messages());
        $branch = BranchService::create($main, $owner, $data, $request);

        return redirect('/seller/branches')->with('success', "{$branch->branch_name} was sent for review. We'll notify you when it is approved.");
    }

    /** POST seller/switch-store {store_id} — the store switcher (owner only). 0 / the main store = back to the main store. */
    public function switch(Request $request): RedirectResponse
    {
        $owner = $request->user();
        $id = (int) $request->input('store_id');
        $store = $id ? Store::find($id) : StoreContext::mainFor($owner);
        if (! $store || (int) $store->user_id !== (int) $owner->id) {
            abort(403, "That isn't one of your stores.");
        }
        if (! StoreContext::switchTo($owner, $store, $request)) {
            return back()->with('error', "{$store->store_name} isn't approved yet.");
        }
        \App\Services\SidebarBadgeService::forget($owner->id);

        return redirect($request->input('to') === 'main-dashboard' ? '/seller/main-dashboard' : '/seller/dashboard')
            ->with('success', "You are now working in {$store->store_name}.");
    }
}
