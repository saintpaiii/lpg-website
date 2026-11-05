<?php

namespace App\Services;

use App\Exceptions\PaymentServiceUnavailable;
use App\Mail\SubscriptionNotice;
use App\Models\Delivery;
use App\Models\Product;
use App\Models\Store;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\Vehicle;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Store subscription plans — every plan rule lives here.
 *
 * Plans are prepaid for 30 days (PayMongo, or cash recorded by the admin) and never renew by themselves.
 * Same plan while active → +30 days after the current end; a different plan → starts now (old days dropped).
 * A store without an active plan is hidden from customers (Store::scopeVisibleToCustomers / isOpenToCustomers).
 */
class SubscriptionService
{
    public const PLAN_KEYS = ['basic', 'pro', 'premium'];

    private const PLANS_CACHE = 'subscription-plans';

    // ── Plans & state ─────────────────────────────────────────────────────────

    /** Basic / Pro / Premium rows, cheapest first (cached 60 s; edits call forgetPlans()). */
    public static function plans(): Collection
    {
        return Cache::remember(self::PLANS_CACHE, 60, fn () => SubscriptionPlan::orderBy('sort_order')->get());
    }

    public static function forgetPlans(): void
    {
        Cache::forget(self::PLANS_CACHE);
    }

    public static function plan(string $key): ?SubscriptionPlan
    {
        return static::plans()->firstWhere('key', $key === 'trial' ? 'premium' : $key);
    }

    public static function planName(?string $key): string
    {
        return match ($key) {
            'trial'      => 'Free trial',
            null, 'none' => 'No plan',
            default      => static::plans()->firstWhere('key', $key)?->name ?? ucfirst($key),
        };
    }

    /** Plan catalog for <PlanCards> (landing Pricing, registration, My Plan, the expiry popup). */
    public static function publicPlans(): array
    {
        $features = config('plans.features');

        return [
            'plans' => static::plans()->map(fn (SubscriptionPlan $p) => [
                'id'       => $p->id,
                'key'      => $p->key,
                'name'     => $p->name,
                'price'    => (float) $p->price,
                'limits'   => ['products' => $p->max_products, 'staff' => $p->max_staff, 'vehicles' => $p->max_vehicles],
                'features' => $features[$p->key] ?? [],
            ])->values()->all(),
            'feature_labels' => config('plans.feature_labels'),
            'core_features'  => config('plans.core_features'),
            'days'           => (int) config('plans.days', 30),
            'trial_days'     => (int) config('plans.trial_days', 30),
        ];
    }

    public static function isActive(Store $store): bool
    {
        return $store->subscription_plan !== null && $store->subscription_plan !== 'none'
            && $store->subscription_expires_at !== null && $store->subscription_expires_at->isFuture();
    }

    public static function currentKey(Store $store): string
    {
        return static::isActive($store) ? $store->subscription_plan : 'none';
    }

    /** @return string[] */
    public static function features(Store $store): array
    {
        return config('plans.features')[static::currentKey($store)] ?? [];
    }

    public static function hasFeature(Store $store, string $feature): bool
    {
        return in_array($feature, static::features($store), true);
    }

    /**
     * Limits of the current plan (trial = Premium). Without an active plan: the last plan's limits (Basic if none).
     *
     * @return array{products: ?int, staff: ?int, vehicles: ?int}
     */
    public static function limits(Store $store): array
    {
        $key = static::isActive($store) ? $store->subscription_plan
            : (in_array($store->subscription_plan, [...self::PLAN_KEYS, 'trial'], true) ? $store->subscription_plan : 'basic');
        $plan = static::plan($key) ?? static::plan('basic');

        return [
            'products' => $plan?->max_products,
            'staff'    => $plan?->max_staff,
            'vehicles' => $plan?->max_vehicles,
        ];
    }

    /** Whole days left (rounded up), 0 when expired. */
    public static function daysLeft(Store $store): int
    {
        if (! static::isActive($store)) {
            return 0;
        }

        return (int) max(0, ceil(now()->diffInSeconds($store->subscription_expires_at, false) / 86400));
    }

    /** Shared 'plan' prop for the seller layout (sidebar, banner, popup). */
    public static function summary(Store $store): array
    {
        $active = static::isActive($store);
        $key    = $store->subscription_plan ?: 'none';

        return [
            'key'           => $active ? $key : 'none',
            'last_key'      => $key,
            'name'          => $active ? static::planName($key) : 'No plan',
            'last_name'     => $key !== 'none' ? static::planName($key) : null,
            'is_trial'      => $active && $key === 'trial',
            'active'        => $active,
            'expires_at'    => $store->subscription_expires_at?->toIso8601String(),
            'expires_label' => $store->subscription_expires_at?->format('M j, Y'),
            'days_left'     => static::daysLeft($store),
            'features'      => static::features($store),
            'limits'        => static::limits($store),
            'featured'      => $active && in_array($key, ['premium', 'trial'], true),
            'trial_used'    => $store->trial_used_at !== null,
        ];
    }

    public static function summaryCacheKey(int $storeId): string
    {
        return "plan-summary:{$storeId}";
    }

    public static function forgetSummary(int $storeId): void
    {
        Cache::forget(static::summaryCacheKey($storeId));
    }

    // ── Limits (products / staff / vehicles) ──────────────────────────────────

    public const LIMIT_TYPES = ['products', 'staff', 'vehicles'];

    /** Published products (paused ones are unpublished, so they don't count). */
    private static function countedProducts(int $storeId)
    {
        return Product::where('store_id', $storeId)->where('is_active', true);
    }

    /** Active, not paused staff — riders included, the owner never (role 'seller'). */
    private static function countedStaff(int $storeId)
    {
        return User::where('store_id', $storeId)->where('role', 'seller_staff')
            ->where('is_active', true)->where('paused_by_plan', false);
    }

    private static function countedVehicles(int $storeId)
    {
        return Vehicle::where('store_id', $storeId)->where('status', '!=', 'retired')->where('paused_by_plan', false);
    }

    /** What the store currently uses against its limits. */
    public static function usage(Store $store): array
    {
        return [
            'products' => static::countedProducts($store->id)->count(),
            'staff'    => static::countedStaff($store->id)->count(),
            'vehicles' => static::countedVehicles($store->id)->count(),
        ];
    }

    /** Items paused because of the plan, per type. */
    public static function pausedCounts(Store $store): array
    {
        return [
            'products' => Product::where('store_id', $store->id)->where('paused_by_plan', true)->count(),
            'staff'    => User::where('store_id', $store->id)->where('role', 'seller_staff')->where('paused_by_plan', true)->count(),
            'vehicles' => Vehicle::where('store_id', $store->id)->where('paused_by_plan', true)->count(),
        ];
    }

    /** May the store publish / add / activate one more of this type? */
    public static function canAdd(Store $store, string $type): bool
    {
        $limit = static::limits($store)[$type] ?? null;

        return $limit === null || static::usage($store)[$type] < $limit;
    }

    public static function limitMessage(Store $store, string $type): string
    {
        $limit = (int) (static::limits($store)[$type] ?? 0);
        $noun  = match ($type) {
            'products' => $limit === 1 ? 'published product' : 'published products',
            'staff'    => $limit === 1 ? 'staff account' : 'staff accounts',
            default    => $limit === 1 ? 'vehicle' : 'vehicles',
        };
        $plan = static::planName(static::isActive($store) ? $store->subscription_plan : ($store->subscription_plan !== 'none' ? $store->subscription_plan : 'basic'));
        $verb = $type === 'products' ? 'Unpublish' : 'Pause';

        return "Your {$plan} plan allows {$limit} {$noun}. {$verb} one or upgrade your plan.";
    }

    /** "3 products and 1 vehicle" */
    private static function countPhrase(array $counts): string
    {
        $parts = [];
        foreach ($counts as $type => $n) {
            if ($n > 0) {
                $parts[] = $n . ' ' . match ($type) {
                    'products' => $n === 1 ? 'product' : 'products',
                    'staff'    => $n === 1 ? 'staff account' : 'staff accounts',
                    default    => $n === 1 ? 'vehicle' : 'vehicles',
                };
            }
        }
        if (count($parts) <= 1) {
            return $parts[0] ?? '';
        }
        $last = array_pop($parts);

        return implode(', ', $parts) . ' and ' . $last;
    }

    /** Lowest plan that includes a feature: 'pro' or 'premium'. */
    public static function requiredPlanKey(string $feature): string
    {
        foreach (self::PLAN_KEYS as $key) {
            if (in_array($feature, config('plans.features')[$key] ?? [], true)) {
                return $key;
            }
        }

        return 'premium';
    }

    public static function requiredPlanName(string $feature): string
    {
        return static::planName(static::requiredPlanKey($feature));
    }

    /** "{Feature label} is available on the {Pro|Premium} plan." */
    public static function featureMessage(string $feature): string
    {
        $label = config('plans.feature_labels')[$feature] ?? ucfirst($feature);

        return "{$label} is available on the " . static::requiredPlanName($feature) . ' plan.';
    }

    /** Riders on an active delivery (kept first — and always kept). */
    private static function busyRiderIds(int $storeId): array
    {
        return Delivery::where('store_id', $storeId)->whereIn('status', Delivery::ACTIVE_STATUSES)
            ->whereNotNull('rider_id')->distinct()->pluck('rider_id')->all();
    }

    /** Vehicles on an active delivery (vehicles.status 'in_use' is not always reset, so it isn't trusted). */
    public static function busyVehicleIds(int $storeId): array
    {
        $onDelivery = Delivery::where('store_id', $storeId)->whereIn('status', Delivery::ACTIVE_STATUSES)
            ->whereNotNull('vehicle_id')->distinct()->pluck('vehicle_id')->all();

        // A vehicle a rider took for the shift is in use too (plan pausing must not take it away)
        return array_values(array_unique([...$onDelivery, ...RiderLoadService::heldVehicleIds($storeId)]));
    }

    /** Paused accounts lose their mobile (Sanctum) tokens; the web session is ended by LogoutPausedStaff. */
    public static function revokeTokens(array $userIds): void
    {
        if ($userIds) {
            \Laravel\Sanctum\PersonalAccessToken::where('tokenable_type', User::class)->whereIn('tokenable_id', $userIds)->delete();
        }
    }

    public static function riderIsBusy(User $user): bool
    {
        return Delivery::where('rider_id', $user->id)->whereIn('status', Delivery::ACTIVE_STATUSES)->exists();
    }

    /**
     * Counted items that would be paused under these limits: busy ones are kept first (and always kept), then
     * the oldest.
     *
     * @return array{products: Collection, staff: Collection, vehicles: Collection, busy_over: array<string,int>}
     */
    private static function overLimit(Store $store, array $limits): array
    {
        $out = ['busy_over' => []];

        $limit = $limits['products'];
        $out['products'] = $limit === null ? collect()
            : static::countedProducts($store->id)->orderBy('created_at')->orderBy('id')->get(['id', 'name', 'brand'])->slice($limit)->values();

        foreach (['staff' => static::busyRiderIds($store->id), 'vehicles' => static::busyVehicleIds($store->id)] as $type => $busy) {
            $limit = $limits[$type];
            if ($limit === null) {
                $out[$type] = collect();
                continue;
            }
            $query = $type === 'staff' ? static::countedStaff($store->id) : static::countedVehicles($store->id);
            $items = $query->orderBy('created_at')->orderBy('id')->get();
            // Busy first, then oldest (partition keeps the age order inside each group)
            [$busyItems, $idle] = $items->partition(fn ($m) => in_array($m->id, $busy));
            if ($busyItems->count() > $limit) {
                $out['busy_over'][$type] = $busyItems->count();
            }
            $out[$type] = $busyItems->concat($idle)->slice(max($limit, $busyItems->count()))->values();
        }

        return $out;
    }

    /** Limits of a plan key (trial = Premium = unlimited). */
    public static function planLimits(string $planKey): array
    {
        $plan = static::plan($planKey);

        return ['products' => $plan?->max_products, 'staff' => $plan?->max_staff, 'vehicles' => $plan?->max_vehicles];
    }

    /**
     * For the confirm dialog on My Plan: what WOULD be paused with that plan's limits, plus the features that lock.
     */
    public static function previewPause(Store $store, string $planKey): array
    {
        $over = static::overLimit($store, static::planLimits($planKey));

        $newFeatures = config('plans.features')[$planKey] ?? [];
        $labels      = config('plans.feature_labels');
        $locked = collect(static::features($store))->reject(fn ($f) => in_array($f, $newFeatures, true))
            ->map(fn ($f) => $labels[$f] ?? $f)->values()->all();

        return [
            'products'        => $over['products']->count(),
            'staff'           => $over['staff']->count(),
            'vehicles'        => $over['vehicles']->count(),
            'product_names'   => $over['products']->take(5)->map(fn ($p) => trim($p->name . ($p->brand ? " ({$p->brand})" : '')))->values()->all(),
            'staff_names'     => $over['staff']->take(5)->pluck('name')->values()->all(),
            'vehicle_names'   => $over['vehicles']->take(5)->pluck('plate_number')->values()->all(),
            'locked_features' => $locked,
            'usage'           => static::usage($store),
            'limits'          => static::planLimits($planKey),
        ];
    }

    public static function previewHasChanges(array $preview): bool
    {
        return $preview['products'] + $preview['staff'] + $preview['vehicles'] > 0 || $preview['locked_features'] !== [];
    }

    /**
     * Pause what is over the plan's limits (oldest kept), or bring paused items back (oldest first) when there is
     * room. Nothing is ever deleted. Runs when a plan becomes active / changes / its limits change — never on expiry.
     *
     * @return array{paused: array<string,int>, restored: array<string,int>}
     */
    public static function applyPlanLimits(Store $store): array
    {
        $store  = $store->fresh() ?? $store;
        $zero   = ['products' => 0, 'staff' => 0, 'vehicles' => 0];
        $result = ['paused' => $zero, 'restored' => $zero];
        if (! static::isActive($store)) {
            return $result;
        }
        $limits   = static::limits($store);
        $busyOver = [];

        DB::transaction(function () use ($store, $limits, &$result, &$busyOver) {
            $over = static::overLimit($store, $limits);
            $busyOver = $over['busy_over'];

            // Pause what is over the limit
            if ($over['products']->isNotEmpty()) {
                $result['paused']['products'] = Product::whereIn('id', $over['products']->pluck('id'))
                    ->update(['is_active' => false, 'paused_by_plan' => true]);
            }
            if ($over['staff']->isNotEmpty()) {
                $result['paused']['staff'] = User::whereIn('id', $over['staff']->pluck('id'))->update(['paused_by_plan' => true]);
                static::revokeTokens($over['staff']->pluck('id')->all());
            }
            if ($over['vehicles']->isNotEmpty()) {
                $result['paused']['vehicles'] = Vehicle::whereIn('id', $over['vehicles']->pluck('id'))->update(['paused_by_plan' => true]);
            }

            // Lift pauses that no longer count (deactivated account / retired vehicle)
            User::where('store_id', $store->id)->where('role', 'seller_staff')->where('paused_by_plan', true)
                ->where('is_active', false)->update(['paused_by_plan' => false]);
            Vehicle::where('store_id', $store->id)->where('paused_by_plan', true)->where('status', 'retired')
                ->update(['paused_by_plan' => false]);

            // Restore paused items (oldest first) while there is room
            $usage = static::usage($store);
            $room  = fn (string $type) => $limits[$type] === null ? 1000000 : max(0, $limits[$type] - $usage[$type]);
            $restore = function (string $type, $query, array $values) use ($room, &$result) {
                $ids = $query->where('paused_by_plan', true)->orderBy('created_at')->orderBy('id')->limit($room($type))->pluck('id');
                if ($ids->isNotEmpty()) {
                    $result['restored'][$type] = $query->getModel()->newQuery()->whereIn('id', $ids)->update($values);
                }
            };
            $restore('products', Product::where('store_id', $store->id), ['is_active' => true, 'paused_by_plan' => false]);
            $restore('staff', User::where('store_id', $store->id)->where('role', 'seller_staff'), ['paused_by_plan' => false]);
            $restore('vehicles', Vehicle::where('store_id', $store->id), ['paused_by_plan' => false]);
        });

        static::forgetSummary($store->id);
        SidebarBadgeService::forgetStore($store->id);

        // One summary notification for the owner
        $planName = static::planName($store->subscription_plan);
        $lines = [];
        if (array_sum($result['paused']) > 0) {
            $allows = array_intersect_key($limits, array_filter($result['paused']));
            $lines[] = ucfirst(static::countPhrase($result['paused'])) . ' ' . (array_sum($result['paused']) === 1 ? 'was' : 'were')
                . " paused because your {$planName} plan allows " . static::countPhrase($allows) . '. Nothing was deleted.';
        }
        if (array_sum($result['restored']) > 0) {
            $lines[] = ucfirst(static::countPhrase($result['restored'])) . ' ' . (array_sum($result['restored']) === 1 ? 'was' : 'were')
                . " restored with your {$planName} plan.";
        }
        foreach ($busyOver as $type => $n) {
            $lines[] = "{$n} " . ($type === 'staff' ? 'riders' : 'vehicles')
                . ' on an active delivery were kept, so your store is over the limit until those deliveries finish.';
        }
        if ($lines && $store->user_id) {
            NotificationService::send($store->user_id, 'subscription', 'Plan limits updated', implode(' ', $lines), ['link' => '/seller/plan']);
        }

        return $result;
    }

    // ── Trial ─────────────────────────────────────────────────────────────────

    /** The one-time 30-day Premium trial, right after a store is approved. False if it already had one. */
    public static function startTrial(Store $store): bool
    {
        if ($store->trial_used_at !== null) {
            return false;
        }

        $payment = SubscriptionPayment::create([
            'store_id' => $store->id,
            'plan_key' => 'trial',
            'amount'   => 0,
            'status'   => 'pending',
            'method'   => 'trial',
            'days'     => (int) config('plans.trial_days', 30),
            'notes'    => 'Free 30-day Premium trial',
        ]);
        $result = static::apply($payment, 'trial', null, null);
        if (! $result) {
            return false;
        }
        [, $store] = $result;

        static::notifyOwner($store, 'Your free trial has started',
            "Your free 30-day Premium trial has started. It ends on {$store->subscription_expires_at->format('M j, Y')}.",
            'Your free 30-day Premium trial has started', [
                'Your store is now visible to customers with all Premium features, including the Featured badge.',
                "The trial ends on {$store->subscription_expires_at->format('M j, Y')}. Choose a plan before then so your products stay visible.",
            ], 'See plans');
        static::applyPlanLimits($store);

        return true;
    }

    // ── Buying a plan ─────────────────────────────────────────────────────────

    /**
     * Start a PayMongo checkout for a plan. Returns ['checkout_url' => …] or ['error' => message].
     *
     * @return array{checkout_url?: string, error?: string}
     */
    public static function createCheckout(Store $store, User $user, string $planKey): array
    {
        $plan = in_array($planKey, self::PLAN_KEYS, true) ? static::plan($planKey) : null;
        if (! $plan) {
            return ['error' => 'This plan is not available.'];
        }

        SubscriptionPayment::where('store_id', $store->id)->where('status', 'pending')
            ->whereIn('method', ['paymongo'])->update(['status' => 'cancelled']);

        $payment = SubscriptionPayment::create([
            'store_id'   => $store->id,
            'plan_key'   => $plan->key,
            'amount'     => $plan->price,
            'status'     => 'pending',
            'method'     => 'paymongo',
            'days'       => (int) config('plans.days', 30),
            'created_by' => $user->id,
        ]);

        // A free price (admin set ₱0) needs no payment
        if ((float) $plan->price <= 0) {
            static::markPaid($payment, 'gift', 'Free plan price');

            return ['checkout_url' => url("/seller/plan?payment=success&p={$payment->id}")];
        }

        try {
            $session = app(PayMongoService::class)->createCheckoutSession([
                'reference_number' => "SUB-{$payment->id}",
                'description'      => "LPG Marketplace — {$plan->name} plan (30 days)",
                'line_items'       => [[
                    'name'        => "{$plan->name} plan — 30 days",
                    'description' => "{$store->store_name} · {$plan->name} plan for 30 days",
                    'amount'      => (int) round((float) $plan->price * 100),
                    'currency'    => 'PHP',
                    'quantity'    => 1,
                ]],
                'success_url'    => url("/seller/plan?payment=success&p={$payment->id}"),
                'cancel_url'     => url("/seller/plan?payment=cancelled&p={$payment->id}"),
                'customer_name'  => $store->owner?->name ?? $user->name,
                'customer_email' => $store->owner?->email ?? $user->email,
                'customer_phone' => $store->owner?->phone ?? $user->phone,
            ]);
        } catch (\Throwable $e) {
            Log::error('Subscription checkout failed', ['store_id' => $store->id, 'plan' => $planKey, 'error' => $e->getMessage()]);
            $payment->update(['status' => 'cancelled']);

            // Local: show PayMongo's real reason (e.g. "PayMongo is currently under maintenance.")
            if (app()->isLocal()) {
                return ['error' => preg_replace('/^\[PayMongo\] \w+: /', 'PayMongo: ', $e->getMessage())];
            }

            return ['error' => PaymentServiceUnavailable::friendlyMessage($e) ?? 'Could not start payment. Please try again later.'];
        }

        $payment->update(['paymongo_checkout_id' => $session['id']]);

        return ['checkout_url' => $session['checkout_url']];
    }

    /** Ask PayMongo whether a checkout was paid (success page). True when the payment is (now) paid. */
    public static function verifyCheckout(SubscriptionPayment $payment): bool
    {
        if ($payment->status === 'paid') {
            return true;
        }
        if (! $payment->paymongo_checkout_id) {
            return false;
        }

        try {
            $session = app(PayMongoService::class)->retrieveCheckoutSession($payment->paymongo_checkout_id);
            $first   = ($session['attributes']['payments'] ?? [])[0] ?? null;
            if (($first['attributes']['status'] ?? null) === 'paid') {
                static::markPaid($payment, 'paymongo', $first['id'] ?? $payment->paymongo_checkout_id);
            }
        } catch (\Throwable $e) {
            Log::warning('Subscription payment check failed', ['payment_id' => $payment->id, 'error' => $e->getMessage()]);
        }

        return $payment->fresh()->status === 'paid';
    }

    /**
     * A plan payment was received (PayMongo webhook / success page, cash, …). Idempotent: the webhook and the
     * success page may arrive at the same moment — only the first one applies the 30 days.
     * A 'cancelled' payment that PayMongo reports as paid is applied (the money was received).
     */
    public static function markPaid(SubscriptionPayment $payment, string $method, ?string $reference = null, ?User $recordedBy = null): bool
    {
        $result = static::apply($payment, $method, $reference, $recordedBy);
        if (! $result) {
            return false;
        }
        [$payment, $store] = $result;

        $planName = static::planName($payment->plan_key);
        $until    = $store->subscription_expires_at->format('M j, Y');
        static::notifyOwner($store, 'Payment received',
            "Payment received — your {$planName} plan is active until {$until}.",
            "Payment received — your {$planName} plan is active", [
                "Thank you! We received ₱" . number_format((float) $payment->amount, 2) . " for the {$planName} plan (receipt {$payment->receipt_number}).",
                "Your plan is active until {$until}.",
            ], 'View my plan');
        static::notifyAdmins('Subscription payment received',
            "{$store->store_name} paid ₱" . number_format((float) $payment->amount, 2) . " for the {$planName} plan ({$payment->receipt_number}).");
        static::applyPlanLimits($store);

        return true;
    }

    /**
     * Apply a payment to its store under a global lock (receipt numbers must never repeat across stores):
     * re-read the payment FOR UPDATE, stop if it is already paid, then extend or start the plan.
     *
     * @return array{0: SubscriptionPayment, 1: Store}|null  null when it was already applied
     */
    private static function apply(SubscriptionPayment $payment, string $method, ?string $reference, ?User $recordedBy): ?array
    {
        $result = Cache::lock('subscription-receipt', 15)->block(10, fn () => DB::transaction(function () use ($payment, $method, $reference, $recordedBy) {
            $p = SubscriptionPayment::whereKey($payment->id)->lockForUpdate()->first();
            if (! $p || $p->status === 'paid') {
                return null;
            }
            $store = Store::withTrashed()->whereKey($p->store_id)->lockForUpdate()->first();

            // Same plan while active → after the current end; otherwise it starts now
            $extends = static::isActive($store) && $store->subscription_plan === $p->plan_key;
            $start   = $extends ? $store->subscription_expires_at : now();
            $end     = $start->copy()->addDays($p->days ?: 30);

            $p->update([
                'status'         => 'paid',
                'method'         => $method,
                'reference'      => $reference ?? $p->reference,
                'paid_at'        => now(),
                'period_start'   => $start,
                'period_end'     => $end,
                'receipt_number' => $p->receipt_number ?: static::nextReceiptNumber(),
                'recorded_by'    => $recordedBy?->id ?? $p->recorded_by,
            ]);

            $store->forceFill([
                'subscription_plan'        => $p->plan_key,
                'subscription_started_at'  => $extends ? ($store->subscription_started_at ?? $start) : $start,
                'subscription_expires_at'  => $end,
                'plan_reminder_sent_on'    => null,
                'plan_expired_notified_at' => null,
                'is_featured'              => in_array($p->plan_key, ['premium', 'trial'], true),
            ] + ($p->plan_key === 'trial' ? ['trial_used_at' => $store->trial_used_at ?? now()] : []))->save();

            return [$p->fresh(), $store->fresh()];
        }));

        if ($result) {
            static::forgetSummary($result[1]->id);
        }

        return $result;
    }

    /** Next "SUB-YYYY-MM-###" (restarts every month). Call inside the global lock. */
    private static function nextReceiptNumber(): string
    {
        $prefix = 'SUB-' . now()->format('Y-m') . '-';
        $last = SubscriptionPayment::where('receipt_number', 'like', $prefix . '%')
            ->orderByRaw('LENGTH(receipt_number) DESC')->orderByDesc('receipt_number')
            ->value('receipt_number');
        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix . str_pad((string) $next, 3, '0', STR_PAD_LEFT);
    }

    // ── Admin actions ─────────────────────────────────────────────────────────

    /**
     * Free days from the admin. Active plan → extended. Expired → the store's last PAID plan (never a second free
     * Premium trial), Basic if it never paid.
     */
    public static function giveDays(Store $store, int $days, string $reason, User $admin): SubscriptionPayment
    {
        $planKey = static::isActive($store)
            ? $store->subscription_plan
            : (SubscriptionPayment::where('store_id', $store->id)->paid()->whereIn('plan_key', self::PLAN_KEYS)
                ->whereIn('method', ['paymongo', 'cash'])->latest('paid_at')->value('plan_key') ?? 'basic');

        $payment = SubscriptionPayment::create([
            'store_id'    => $store->id,
            'plan_key'    => $planKey,
            'amount'      => 0,
            'status'      => 'pending',
            'method'      => 'gift',
            'days'        => $days,
            'notes'       => $reason,
            'recorded_by' => $admin->id,
        ]);
        [$payment, $store] = static::apply($payment, 'gift', null, $admin) ?? [$payment->fresh(), $store->fresh()];

        $until = $store->subscription_expires_at?->format('M j, Y');
        static::notifyOwner($store, 'Free days added',
            "{$days} free day(s) were added to your " . static::planName($planKey) . " plan. It is now active until {$until}.",
            'Free days were added to your plan', [
                "{$days} free day(s) were added to your " . static::planName($planKey) . " plan.",
                "Reason: {$reason}",
                "Your plan is active until {$until}.",
            ], 'View my plan');
        static::applyPlanLimits($store);

        return $payment;
    }

    /** Cash (or bank) payment received by the admin. */
    public static function recordCash(Store $store, string $planKey, ?string $reference, User $admin): SubscriptionPayment
    {
        $plan = static::plan($planKey);
        $payment = SubscriptionPayment::create([
            'store_id'    => $store->id,
            'plan_key'    => $planKey,
            'amount'      => $plan?->price ?? 0,
            'status'      => 'pending',
            'method'      => 'cash',
            'days'        => (int) config('plans.days', 30),
            'reference'   => $reference,
            'created_by'  => $admin->id,
            'recorded_by' => $admin->id,
        ]);
        static::markPaid($payment, 'cash', $reference, $admin);

        return $payment->fresh();
    }

    // ── Scheduled ─────────────────────────────────────────────────────────────

    /** Reminders in the last days, end-of-plan notices, stale checkouts. Returns counts. */
    public static function runHourly(): array
    {
        $counts = ['reminded' => 0, 'expired' => 0, 'cancelled' => 0];
        $today  = now()->startOfDay();
        $reminderDays = (int) config('plans.reminder_days', 3);

        // Ending within the reminder window — once per day
        $ending = Store::where('subscription_plan', '!=', 'none')
            ->where('subscription_expires_at', '>', now())
            ->where('subscription_expires_at', '<=', now()->addDays($reminderDays))
            ->where(fn ($q) => $q->whereNull('plan_reminder_sent_on')->orWhere('plan_reminder_sent_on', '<', $today->toDateString()))
            ->with('owner:id,name,email')
            ->get();
        foreach ($ending as $store) {
            $n    = static::daysLeft($store);
            $date = $store->subscription_expires_at->format('M j, Y');
            $text = $store->subscription_plan === 'trial'
                ? "Your free trial ends in {$n} day(s) on {$date}. Choose a plan so your products stay visible."
                : "Your " . static::planName($store->subscription_plan) . " plan ends in {$n} day(s) on {$date}. Renew now so your products stay visible.";
            static::notifyOwner($store, $store->subscription_plan === 'trial' ? 'Your free trial ends soon' : 'Your plan ends soon', $text,
                $store->subscription_plan === 'trial' ? 'Your free trial ends soon' : 'Your plan ends soon', [$text],
                $store->subscription_plan === 'trial' ? 'Choose a plan' : 'Renew now');
            $store->forceFill(['plan_reminder_sent_on' => $today->toDateString()])->save();
            static::forgetSummary($store->id);
            $counts['reminded']++;
        }

        // Ended without renewal — hidden from customers already (the visibility rule uses expires_at)
        $ended = Store::where('subscription_plan', '!=', 'none')
            ->whereNotNull('subscription_expires_at')
            ->where('subscription_expires_at', '<=', now())
            ->whereNull('plan_expired_notified_at')
            ->with('owner:id,name,email')
            ->get();
        foreach ($ended as $store) {
            $text = 'Your plan has ended. Your products are now hidden from customers. Choose a plan to reopen your store.';
            static::notifyOwner($store, 'Your plan has ended', $text, 'Your plan has ended', [
                $text,
                'You can still log in and finish orders that were already placed.',
            ], 'Choose a plan');
            static::notifyAdmins('Store plan ended', "{$store->store_name}'s " . static::planName($store->subscription_plan) . ' plan ended without renewal.');
            $store->forceFill(['plan_expired_notified_at' => now(), 'is_featured' => false])->save();
            static::forgetSummary($store->id);
            $counts['expired']++;
        }

        // Abandoned checkouts
        $counts['cancelled'] = SubscriptionPayment::where('status', 'pending')
            ->where('created_at', '<', now()->subDay())
            ->update(['status' => 'cancelled']);

        return $counts;
    }

    // ── Admin numbers ─────────────────────────────────────────────────────────

    /** Money received for plans (PayMongo + cash) in a range; all time without dates. */
    public static function income(?CarbonInterface $from = null, ?CarbonInterface $to = null): float
    {
        return round((float) SubscriptionPayment::paid()->whereIn('method', ['paymongo', 'cash'])
            ->when($from, fn ($q) => $q->where('paid_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('paid_at', '<=', $to))
            ->sum('amount'), 2);
    }

    /** Approved stores per plan: trial / basic / pro / premium (active) and expired. */
    public static function storesByPlan(): array
    {
        $now    = now();
        $counts = Store::where('status', 'approved')->where('subscription_expires_at', '>', $now)
            ->where('subscription_plan', '!=', 'none')
            ->selectRaw('subscription_plan, COUNT(*) as n')->groupBy('subscription_plan')->pluck('n', 'subscription_plan');

        return [
            'trial'   => (int) ($counts['trial'] ?? 0),
            'basic'   => (int) ($counts['basic'] ?? 0),
            'pro'     => (int) ($counts['pro'] ?? 0),
            'premium' => (int) ($counts['premium'] ?? 0),
            'expired' => Store::where('status', 'approved')->where('subscription_plan', '!=', 'none')
                ->where('subscription_expires_at', '<=', $now)->count(),
        ];
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    /** Bell + email to the store owner. A mail problem never breaks a payment or the job. */
    private static function notifyOwner(Store $store, string $title, string $message, string $heading, array $lines, ?string $button): void
    {
        if (! $store->user_id) {
            return;
        }
        NotificationService::send($store->user_id, 'subscription', $title, $message, ['link' => '/seller/plan']);

        $email = $store->owner?->email ?? User::whereKey($store->user_id)->value('email');
        if (! $email) {
            return;
        }
        try {
            Mail::to($email)->send(new SubscriptionNotice($title, $heading, $lines, $button, url('/seller/plan')));
        } catch (\Throwable $e) {
            Log::warning('Subscription email failed', ['store_id' => $store->id, 'error' => $e->getMessage()]);
        }
    }

    public static function notifyAdmins(string $title, string $message): void
    {
        foreach (['admin', 'platform_admin'] as $role) {
            NotificationService::sendToRole($role, 'subscription', $title, $message, ['link' => '/admin/subscriptions']);
        }
    }

    /** View data for a receipt PDF (exports/table.blade.php). */
    public static function receiptViewData(SubscriptionPayment $p): array
    {
        $peso   = fn ($n) => '₱' . number_format((float) $n, 2);
        $period = static::periodLabel($p->period_start, $p->period_end);
        $plan   = static::planName($p->plan_key);

        return [
            'title'        => "Subscription Receipt {$p->receipt_number}",
            'subtitle'     => $p->store?->store_name,
            'orgName'      => \App\Models\Setting::get('company_name') ?: 'LPG Marketplace Cavite',
            'orgSub'       => 'Cavite, Philippines',
            'dateRange'    => $period,
            'summaryItems' => [
                ['label' => 'Plan',      'value' => $plan],
                ['label' => 'Amount',    'value' => $peso($p->amount)],
                ['label' => 'Method',    'value' => static::methodLabel($p->method)],
                ['label' => 'Reference', 'value' => $p->reference ?: '—'],
                ['label' => 'Paid on',   'value' => $p->paid_at?->format('M j, Y g:i A') ?? '—'],
            ],
            'columns' => [
                ['key' => 'description', 'label' => 'Description'],
                ['key' => 'period',      'label' => 'Period'],
                ['key' => 'amount',      'label' => 'Amount', 'align' => 'right'],
            ],
            'rows' => [[
                'description' => $p->method === 'gift'
                    ? "{$plan} plan — {$p->days} free day(s)" . ($p->notes ? " ({$p->notes})" : '')
                    : "{$plan} plan — {$p->days} days",
                'period'      => $period,
                'amount'      => $peso($p->amount),
            ]],
        ];
    }

    public static function methodLabel(?string $method): string
    {
        return match ($method) {
            'paymongo' => 'PayMongo',
            'cash'     => 'Cash',
            'trial'    => 'Free trial',
            'gift'     => 'Free days',
            default    => ucfirst((string) $method),
        };
    }

    /** "Nov 3 – Dec 3, 2026" */
    public static function periodLabel(?CarbonInterface $start, ?CarbonInterface $end): string
    {
        if (! $start || ! $end) {
            return '—';
        }

        return $start->year === $end->year
            ? $start->format('M j') . ' – ' . $end->format('M j, Y')
            : $start->format('M j, Y') . ' – ' . $end->format('M j, Y');
    }
}
