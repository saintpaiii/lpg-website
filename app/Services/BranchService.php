<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\Store;
use App\Models\StoreDeliveryRate;
use App\Models\User;
use App\Support\StoreDocuments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * J9 — branches: a branch is a normal store row of the same owner with parent_store_id = the main store.
 * Only a main store on a PAID Premium plan may add branches (plan feature 'branches'; the trial doesn't have it).
 * A branch brings its own location documents (Business / Mayor's Permit, FSIC, DOE LTO); BIR, DTI / SEC and the owner's
 * ID are the main store's ("inherited" — accepted, referenced, never copied).
 */
class BranchService
{
    /** Documents every branch uploads itself (one per physical outlet). */
    public const BRANCH_DOCS = ['business_permit', 'fsic_permit', 'doe_lpg_license'];

    /** Reviewed on the main store and reused by its branches. */
    public const INHERITED_DOCS = ['valid_id', 'bir_permit', 'dti_sec_registration'];

    /** Store settings a new branch starts with (copied from the main store; editable in the branch's Settings). */
    private const COPIED_SETTINGS = [
        'description', 'email', 'logo', 'vat_status', 'tin', 'registered_name', 'registered_address',
        'attendance_radius', 'max_delivery_radius_km', 'allow_cod', 'allow_consignment', 'allow_half_payment',
        'auto_reorder_enabled', 'allow_pickup', 'pickup_instructions', 'min_down_payment_percent', 'consignment_due_days',
        'refund_window_days', 'dti_sec_kind', 'dti_sec_expires_at',
    ];

    /** Can this (main) store add branches now? Paid Premium only. */
    public static function canAdd(Store $main): bool
    {
        return ! $main->isBranch() && $main->status === 'approved' && SubscriptionService::hasFeature($main, 'branches');
    }

    /** Why the owner can't add a branch (null = can). */
    public static function blocker(Store $main): ?string
    {
        if ($main->isBranch()) {
            return 'Branches are added from the main store.';
        }
        if ($main->status !== 'approved') {
            return 'Your main store must be approved first.';
        }

        return static::canAdd($main) ? null : SubscriptionService::featureMessage('branches');
    }

    /** Validation rules of the Add branch form (the address / pin / hours / policy rules are the registration's). */
    public static function rules(Store $main): array
    {
        $file = fn () => \Illuminate\Validation\Rules\File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024);
        $rules = [
            'branch_name' => ['required', 'string', 'max:60',
                \Illuminate\Validation\Rule::unique('stores', 'branch_name')->where('parent_store_id', $main->id)],
            'address'     => ['required', 'string', 'max:500'],
            'city'        => ['required', 'string', 'max:100'],
            'barangay'    => ['required', 'string', 'max:100'],
            'province'    => ['nullable', 'string', 'max:100'],
            'phone'       => ['required', 'string', new \App\Rules\PhPhone(allowLandline: true)],
            'latitude'    => ['required', 'numeric', 'between:-90,90', new \App\Rules\InServiceArea('longitude')],
            'longitude'   => ['required', 'numeric', 'between:-180,180'],
            'always_open' => ['nullable', 'boolean'],
            ...\App\Http\Controllers\Seller\SettingsController::hoursRules(),
            ...\App\Support\ExchangePolicy::rules(),
            'copy_products' => ['nullable', 'boolean'],
        ];
        foreach (self::BRANCH_DOCS as $doc) {
            $rules[$doc] = ['required', $file()];
            $rules["{$doc}_valid_until"] = StoreDocuments::validUntilRule(true, $doc);
        }

        return $rules;
    }

    public static function messages(): array
    {
        $m = \App\Support\UploadMessages::for(self::BRANCH_DOCS) + [
            'branch_name.unique'  => 'You already have a branch with this name.',
            'latitude.required'   => "Please pin the branch's location on the map.",
            'longitude.required'  => "Please pin the branch's location on the map.",
        ];
        foreach (self::BRANCH_DOCS as $doc) {
            $m += StoreDocuments::validUntilMessages("{$doc}_valid_until", $doc);
        }

        return $m;
    }

    /** Create the branch (pending review) and tell the admins. Call after validation. */
    public static function create(Store $main, User $owner, array $data, Request $request): Store
    {
        $branch = DB::transaction(function () use ($main, $owner, $data, $request) {
            $paths = [];
            foreach (self::BRANCH_DOCS as $doc) {
                $paths[$doc] = $request->file($doc)->store(['business_permit' => 'business_permits', 'fsic_permit' => 'fsic_permits', 'doe_lpg_license' => 'doe_licenses'][$doc], 'local');
            }
            $reviews = [];
            foreach (self::INHERITED_DOCS as $doc) {
                $reviews[$doc] = ['status' => 'accepted', 'inherited' => true, 'reason' => null, 'note' => 'From main store — already accepted',
                    'by_id' => null, 'by_name' => 'Main store', 'at' => now()->toIso8601String(), 'expires_at' => null];
            }

            $branch = Store::create(array_merge(
                collect(self::COPIED_SETTINGS)->mapWithKeys(fn ($c) => [$c => $main->{$c}])->all(),
                [
                    'user_id'          => $owner->id,
                    'parent_store_id'  => $main->id,
                    'branch_name'      => trim($data['branch_name']),
                    'store_name'       => Store::branchDisplayName($main->store_name, $data['branch_name']),
                    'address'          => $data['address'],
                    'city'             => $data['city'],
                    'barangay'         => $data['barangay'],
                    'province'         => $data['province'] ?? ($main->province ?: 'Cavite'),
                    'phone'            => $data['phone'],
                    'latitude'         => $data['latitude'],
                    'longitude'        => $data['longitude'],
                    // Reused from the main store — the same files, referenced (never copied)
                    'bir_permit'           => $main->bir_permit,
                    'dti_sec_registration' => $main->dti_sec_registration,
                    'business_permit'  => $paths['business_permit'],
                    'fsic_permit'      => $paths['fsic_permit'],
                    'doe_lpg_license'  => $paths['doe_lpg_license'],
                    'business_permit_expires_at' => $data['business_permit_valid_until'],
                    'fsic_permit_expires_at'     => $data['fsic_permit_valid_until'],
                    'doe_lpg_license_expires_at' => $data['doe_lpg_license_valid_until'],
                    'document_reviews' => $reviews,
                    'status'           => 'pending',
                    'opening_hours'    => ($data['always_open'] ?? true) ? null : \App\Support\StoreHours::normalise($request->input('opening_hours')),
                    'exchange_policy'  => $request->has('exchange_policy') ? \App\Support\ExchangePolicy::clean($request->input('exchange_policy')) : $main->exchange_policy,
                    'subscription_plan'=> 'none',
                    'is_featured'      => false,
                ]
            ));
            // A distinct invoice / receipt series: the main store's code + a 2-letter branch code (e.g. BLC → BLCIM)
            $branch->forceFill(['invoice_prefix' => static::prefixFor($main, $branch->branch_name)])->save();

            foreach (StoreDeliveryRate::where('store_id', $main->id)->get() as $rate) {
                StoreDeliveryRate::create(['store_id' => $branch->id, 'vehicle_type' => $rate->vehicle_type, 'base_fee' => $rate->base_fee, 'fee_per_km' => $rate->fee_per_km]);
            }
            if (! empty($data['copy_products'])) {
                static::copyProducts($main, $branch);
            }

            return $branch;
        });

        NotificationService::sendToRole('admin', 'system', 'New branch for review', "New branch for review: {$branch->store_name}", ['link' => "/admin/stores/{$branch->id}"]);
        NotificationService::sendToRole('platform_admin', 'system', 'New branch for review', "New branch for review: {$branch->store_name}", ['link' => "/admin/stores/{$branch->id}"]);
        SidebarBadgeService::forgetAdmins();

        return $branch;
    }

    /**
     * Invoice code of a branch: the main store's code (up to 3 letters) + 2 letters of the branch name ("Imus Branch" →
     * "IM"), max 5 characters and unique (a digit replaces the last letter on a clash) — so every branch has its own
     * invoice / receipt series that can't collide with the main store's.
     */
    public static function prefixFor(Store $main, string $branchName): string
    {
        $base = substr(InvoiceService::ensurePrefix($main), 0, 3);
        $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', Str::ascii($branchName)));
        $code = $base . str_pad(substr($letters, 0, 2), 2, 'X');
        $taken = array_map('strtoupper', Store::withTrashed()->whereNotNull('invoice_prefix')->pluck('invoice_prefix')->all());
        $taken[] = 'INV';
        for ($n = 2; in_array($code, $taken, true); $n++) {
            $code = substr($base . substr($letters, 0, 1), 0, 5 - strlen((string) $n)) . $n;
        }

        return $code;
    }

    /** Copy the main store's active products (names, sizes, prices) — stock starts at 0. */
    public static function copyProducts(Store $from, Store $to): int
    {
        $n = 0;
        foreach (Product::where('store_id', $from->id)->where('is_active', true)->get() as $p) {
            static::copyProduct($p, $to);
            $n++;
        }

        return $n;
    }

    /** One product into another store (name, type, size, brand, prices, photo) with an empty inventory row. */
    public static function copyProduct(Product $p, Store $to): Product
    {
        $copy = Product::forceCreate(collect($p->getAttributes())->only([
            'product_type', 'accessory_category', 'name', 'brand', 'weight_kg', 'unit_weight_kg', 'weight', 'selling_price',
            'cost_price', 'refill_price', 'purchase_price', 'max_per_order', 'limit_period', 'description', 'image',
        ])->all() + ['store_id' => $to->id, 'is_active' => true]);
        Inventory::create(['product_id' => $copy->id, 'quantity' => 0, 'reorder_level' => (int) (Inventory::where('product_id', $p->id)->value('reorder_level') ?? 10)]);

        return $copy;
    }

    /** The Branches page rows of an owner (main store first). */
    public static function rows(User $owner): array
    {
        $stores = Store::where('user_id', $owner->id)->orderByRaw('parent_store_id IS NOT NULL')->orderBy('branch_name')->get();
        $managers = User::whereIn('store_id', $stores->pluck('id'))->where('role', 'seller_staff')->whereNull('deleted_at')->get()
            ->filter(fn ($u) => \App\Services\StaffAccess::hasStarter($u, 'branch_manager'))->keyBy('store_id');

        return $stores->map(fn (Store $s) => [
            'id'          => $s->id,
            'name'        => $s->store_name,
            'branch_name' => $s->branch_name,
            'is_main'     => ! $s->isBranch(),
            'status'      => $s->status,
            'address'     => trim("{$s->address}, {$s->barangay}, {$s->city}", ', '),
            'plan'        => SubscriptionService::planName(SubscriptionService::currentKey($s)),
            'plan_key'    => SubscriptionService::currentKey($s),
            'days_left'   => SubscriptionService::daysLeft($s),
            'manager'     => ($m = $managers->get($s->id)) ? ['id' => $m->id, 'name' => $m->name, 'email' => $m->email] : null,
            'created_at'  => $s->created_at?->format('M j, Y'),
        ])->values()->all();
    }
}
