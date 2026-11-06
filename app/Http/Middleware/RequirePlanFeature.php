<?php

namespace App\Http\Middleware;

use App\Models\Store;
use App\Services\SubscriptionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * plan.feature:{feature} — the store's current plan must include the feature (export, coupons, loyalty, payroll, dss).
 * The real lock: the sidebar / buttons only open the upgrade dialog.
 */
class RequirePlanFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $user  = $request->user();
        $store = $request->attributes->get('seller_store')
            ?? ($user?->role === 'seller' ? Store::where('user_id', $user->id)->first()
                : ($user?->store_id ? Store::find($user->store_id) : null));

        if (! $store || SubscriptionService::hasFeature($store, $feature)) {
            return $next($request);
        }

        $message = SubscriptionService::featureMessage($feature);

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => $message], 403);
        }

        // Not back(): a bookmark has no referrer
        $home = $user->role === 'seller'
            ? '/seller/plan?choose=' . SubscriptionService::requiredPlanKey($feature)
            : $user->homeUrl();

        return redirect($home)->with('error', $message);
    }
}
