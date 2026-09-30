<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Customer;
use App\Models\CustomerLoyalty;
use App\Models\Order;
use App\Models\Store;
use App\Models\StoreLoyaltySettings;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Customer loyalty program: per-store tiers and trust scores that set
 * consignment terms. Sellers opt in; tiers and scores are system-calculated only.
 */
class LoyaltyController extends Controller
{
    use GeneratesExport;

    /** Consignment terms used at checkout (see LoyaltyService). */
    public static function getConsignmentTerms(int $storeId, int $userId): array
    {
        return LoyaltyService::getConsignmentTerms($storeId, $userId);
    }

    private function sellerStore(Request $request): Store
    {
        return $request->attributes->get('seller_store');
    }

    private function formatSettings(StoreLoyaltySettings $s): array
    {
        return [
            'is_enabled'                      => (bool) $s->is_enabled,
            'regular_threshold'               => $s->regular_threshold,
            'loyal_threshold'                 => $s->loyal_threshold,
            'vip_threshold'                   => $s->vip_threshold,
            'new_downpayment_percent'         => $s->new_downpayment_percent,
            'regular_downpayment_percent'     => $s->regular_downpayment_percent,
            'loyal_downpayment_percent'       => $s->loyal_downpayment_percent,
            'vip_downpayment_percent'         => $s->vip_downpayment_percent,
            'min_trust_score_for_consignment' => (float) $s->min_trust_score_for_consignment,
            'inactivity_days'                 => $s->inactivity_days,
        ];
    }

    // ── Seller ────────────────────────────────────────────────────────────────

    public function getSettings(Request $request): Response
    {
        $store    = $this->sellerStore($request);
        $settings = StoreLoyaltySettings::forStore($store->id);

        return Inertia::render('seller/loyalty-settings', [
            'settings'           => $this->formatSettings($settings),
            'store_default_dp'   => (int) ($store->min_down_payment_percent ?: 50),
            'consignment_on'     => (bool) $store->allow_consignment,
            'enrolled_customers' => CustomerLoyalty::where('store_id', $store->id)->count(),
        ]);
    }

    public function updateSettings(Request $request): RedirectResponse
    {
        $store = $this->sellerStore($request);
        $data  = $request->validate(StoreLoyaltySettings::rules());

        $errors = [];
        if ($data['regular_threshold'] >= $data['loyal_threshold']) {
            $errors['loyal_threshold'] = 'Regular threshold must be less than Loyal threshold.';
        }
        if ($data['loyal_threshold'] >= $data['vip_threshold']) {
            $errors['vip_threshold'] = 'Loyal threshold must be less than VIP threshold.';
        }
        if ($data['new_downpayment_percent'] < $data['regular_downpayment_percent']) {
            $errors['regular_downpayment_percent'] = 'Regular rate cannot be higher than the New customer rate.';
        }
        if ($data['regular_downpayment_percent'] < $data['loyal_downpayment_percent']) {
            $errors['loyal_downpayment_percent'] = 'Loyal rate cannot be higher than the Regular rate.';
        }
        if ($data['loyal_downpayment_percent'] < $data['vip_downpayment_percent']) {
            $errors['vip_downpayment_percent'] = 'VIP rate cannot be higher than the Loyal rate.';
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        StoreLoyaltySettings::forStore($store->id)->update($data);

        return back()->with('success', 'Loyalty settings saved.');
    }

    public function toggleLoyalty(Request $request): RedirectResponse
    {
        $store    = $this->sellerStore($request);
        $data     = $request->validate(['is_enabled' => 'required|boolean']);
        $settings = StoreLoyaltySettings::forStore($store->id);
        $wasOn    = $settings->is_enabled;

        $settings->update(['is_enabled' => $data['is_enabled']]);

        if ($data['is_enabled'] && ! $wasOn) {
            // Customers with at least one delivered order at this store
            $userIds = Customer::whereIn('id', Order::where('store_id', $store->id)->where('status', 'delivered')->distinct()->pluck('customer_id'))
                ->whereNotNull('user_id')->pluck('user_id')->all();

            NotificationService::sendToMany($userIds, 'loyalty_launched', 'New Loyalty Program',
                "{$store->store_name} has launched a loyalty program! Complete orders to unlock better consignment terms.",
                ['store_id' => $store->id, 'link' => '/customer/loyalty']);

            return back()->with('success', 'Loyalty program enabled. ' . count($userIds) . ' past customer(s) were notified.');
        }

        return back()->with('success', $data['is_enabled'] ? 'Loyalty program enabled.' : 'Loyalty program disabled. Consignment is no longer offered at checkout (existing consignment orders are unaffected).');
    }

    /** Owner and HR only — cashier, warehouse and rider staff cannot see customer trust data. */
    private function authorizeCustomerView(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->role === 'seller' || ($user->role === 'seller_staff' && $user->sub_role === 'hr'), 403);
    }

    private function customerQuery(Request $request, int $storeId)
    {
        $query = CustomerLoyalty::query()
            ->join('users', 'users.id', '=', 'customer_loyalty.user_id')
            ->where('customer_loyalty.store_id', $storeId)
            ->select('customer_loyalty.*', 'users.name as customer_name', 'users.email as customer_email', 'users.phone as customer_phone');

        if ($tier = $request->get('tier')) {
            $query->where('customer_loyalty.tier', $tier);
        }
        if ($search = trim((string) $request->get('search'))) {
            $query->where(fn ($q) => $q->where('users.name', 'like', "%{$search}%")->orWhere('users.email', 'like', "%{$search}%"));
        }

        $sortable = ['trust_score', 'total_orders', 'total_spent', 'last_order_at', 'customer_name', 'tier'];
        $sortBy   = in_array($request->get('sort_by'), $sortable) ? $request->get('sort_by') : 'trust_score';
        $dir      = $request->get('sort_dir') === 'asc' ? 'asc' : 'desc';

        $column = match ($sortBy) {
            'customer_name' => 'users.name',
            'tier'          => DB::raw("FIELD(customer_loyalty.tier, 'new','regular','loyal','vip')"),
            default         => "customer_loyalty.{$sortBy}",
        };

        return $query->orderBy($column, $dir)->orderBy('customer_loyalty.id');
    }

    public function getCustomers(Request $request): Response
    {
        $this->authorizeCustomerView($request);
        $store    = $this->sellerStore($request);
        $settings = StoreLoyaltySettings::forStore($store->id);
        $minTrust = (float) $settings->min_trust_score_for_consignment;

        $base = CustomerLoyalty::where('store_id', $store->id);

        return Inertia::render('seller/loyalty-customers', [
            'enabled'  => (bool) $settings->is_enabled,
            'settings' => $this->formatSettings($settings),
            'stats'    => [
                'total'       => (clone $base)->count(),
                'vip'         => (clone $base)->where('tier', 'vip')->count(),
                'avg_trust'   => round((float) (clone $base)->avg('trust_score'), 2),
                'eligible'    => (clone $base)->where('trust_score', '>=', $minTrust)->count(),
            ],
            'customers' => $this->customerQuery($request, $store->id)->paginate(15)->withQueryString()
                ->through(fn (CustomerLoyalty $l) => $this->formatRow($l, $minTrust)),
            'filters'   => [
                'search'   => $request->get('search', ''),
                'tier'     => $request->get('tier', ''),
                'sort_by'  => $request->get('sort_by', 'trust_score'),
                'sort_dir' => $request->get('sort_dir', 'desc'),
            ],
        ]);
    }

    public function exportCustomers(Request $request)
    {
        $this->authorizeCustomerView($request);
        $store    = $this->sellerStore($request);
        $minTrust = (float) StoreLoyaltySettings::forStore($store->id)->min_trust_score_for_consignment;
        $rows     = $this->customerQuery($request, $store->id)->get();

        $csv = $rows->map(fn (CustomerLoyalty $l) => [
            $l->customer_name,
            $l->customer_email,
            LoyaltyService::TIER_LABELS[$l->tier],
            number_format((float) $l->trust_score, 2),
            $l->total_orders,
            $this->peso((float) $l->total_spent),
            $l->cancelled_orders,
            $l->on_time_payments,
            $l->late_payments,
            $l->last_order_at?->format('M d, Y') ?? 'Never',
            (float) $l->trust_score >= $minTrust ? 'Eligible' : 'Not Eligible',
        ])->all();

        $filename = $this->exportFilename('loyalty_customers', $store->store_name, now()->toDateString(), now()->toDateString(), 'csv');

        return $this->csvResponse($filename,
            ['Customer', 'Email', 'Tier', 'Trust Score', 'Orders', 'Total Spent', 'Cancelled', 'On-time Payments', 'Late Payments', 'Last Order', 'Consignment'],
            $csv);
    }

    private function formatRow(CustomerLoyalty $l, float $minTrust): array
    {
        return [
            'id'                  => $l->id,
            'customer_name'       => $l->customer_name,
            'customer_email'      => $l->customer_email,
            'tier'                => $l->tier,
            'trust_score'         => (float) $l->trust_score,
            'total_orders'        => $l->total_orders,
            'total_spent'         => (float) $l->total_spent,
            'cancelled_orders'    => $l->cancelled_orders,
            'on_time_payments'    => $l->on_time_payments,
            'late_payments'       => $l->late_payments,
            'last_order_at'       => $l->last_order_at?->toIso8601String(),
            'consignment_eligible'=> (float) $l->trust_score >= $minTrust,
        ];
    }

    // ── Customer ──────────────────────────────────────────────────────────────

    public function getMyLoyalty(Request $request): Response
    {
        $records = CustomerLoyalty::with(['store'])
            ->where('user_id', $request->user()->id)
            ->whereHas('store.loyaltySettings', fn ($q) => $q->where('is_enabled', true))
            ->get()
            ->map(function (CustomerLoyalty $l) {
                $settings = $l->store->loyaltySettings;
                $next     = $settings->nextTier($l->tier);

                return [
                    'id'                  => $l->id,
                    'store_id'            => $l->store_id,
                    'store_name'          => $l->store->store_name,
                    'store_logo'          => $l->store->logo ? Storage::url($l->store->logo) : null,
                    'tier'                => $l->tier,
                    'trust_score'         => (float) $l->trust_score,
                    'total_orders'        => $l->total_orders,
                    'total_spent'         => (float) $l->total_spent,
                    'on_time_payments'    => $l->on_time_payments,
                    'late_payments'       => $l->late_payments,
                    'downpayment_percent' => $l->getDownpaymentPercent($settings),
                    'consignment_allowed' => (float) $l->trust_score >= (float) $settings->min_trust_score_for_consignment,
                    'min_trust_score'     => (float) $settings->min_trust_score_for_consignment,
                    'next_tier'           => $next ? [
                        'tier'          => $next['tier'],
                        'threshold'     => $next['threshold'],
                        'orders_needed' => max(0, $next['threshold'] - $l->total_orders),
                        // Order count alone isn't enough — promotion also needs trust ≥ 50
                        'blocked_by_trust' => $l->total_orders >= $next['threshold'] && (float) $l->trust_score < 50,
                    ] : null,
                    'tier_rates' => [
                        'new'     => $settings->new_downpayment_percent,
                        'regular' => $settings->regular_downpayment_percent,
                        'loyal'   => $settings->loyal_downpayment_percent,
                        'vip'     => $settings->vip_downpayment_percent,
                    ],
                ];
            })
            ->sortByDesc('total_orders')
            ->values();

        return Inertia::render('customer/loyalty', ['records' => $records]);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    public function adminOverview(Request $request): Response
    {
        $tierCounts = CustomerLoyalty::select('tier', DB::raw('COUNT(*) as n'))->groupBy('tier')->pluck('n', 'tier');

        $query = CustomerLoyalty::query()
            ->join('users', 'users.id', '=', 'customer_loyalty.user_id')
            ->join('stores', 'stores.id', '=', 'customer_loyalty.store_id')
            ->select('customer_loyalty.*', 'users.name as customer_name', 'stores.store_name');

        if ($storeId = $request->get('store_id')) $query->where('customer_loyalty.store_id', $storeId);
        if ($tier = $request->get('tier'))         $query->where('customer_loyalty.tier', $tier);
        if ($search = trim((string) $request->get('search'))) $query->where('users.name', 'like', "%{$search}%");

        $topStores = Store::withCount('customerLoyalties')
            ->with('loyaltySettings')
            ->whereHas('loyaltySettings', fn ($q) => $q->where('is_enabled', true))
            ->orderByDesc('customer_loyalties_count')
            ->limit(5)
            ->get()
            ->map(fn (Store $s) => ['id' => $s->id, 'store_name' => $s->store_name, 'customers' => $s->customer_loyalties_count])
            ->values();

        return Inertia::render('admin/loyalty', [
            'stats' => [
                'stores_enabled'  => StoreLoyaltySettings::where('is_enabled', true)->count(),
                'total_customers' => CustomerLoyalty::count(),
                'avg_trust'       => round((float) CustomerLoyalty::avg('trust_score'), 2),
                'tiers'           => collect(CustomerLoyalty::TIERS)->mapWithKeys(fn ($t) => [$t => (int) ($tierCounts[$t] ?? 0)]),
            ],
            'top_stores' => $topStores,
            'records'    => $query->orderByDesc('customer_loyalty.trust_score')->paginate(20)->withQueryString()
                ->through(fn (CustomerLoyalty $l) => [
                    'id'            => $l->id,
                    'store_name'    => $l->store_name,
                    'customer_name' => $l->customer_name,
                    'tier'          => $l->tier,
                    'trust_score'   => (float) $l->trust_score,
                    'total_orders'  => $l->total_orders,
                    'total_spent'   => (float) $l->total_spent,
                    'last_order_at' => $l->last_order_at?->toIso8601String(),
                ]),
            'stores'  => Store::whereHas('customerLoyalties')->orderBy('store_name')->get(['id', 'store_name']),
            'filters' => $request->only('store_id', 'tier', 'search'),
        ]);
    }
}
