<?php

namespace App\Support;

use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * J9 — the ONE place that decides "which store am I working in".
 *
 *  - Owner (role seller): the store in session('active_store_id') when it is theirs (main or branch) and approved;
 *    otherwise their MAIN store (parent_store_id NULL) — exactly the old behaviour for owners without branches.
 *  - Store staff (incl. a Branch Manager): their own store (users.store_id), as before. Staff can never switch.
 *
 * Registration / pending / become-seller always mean the MAIN store: use mainFor().
 */
class StoreContext
{
    public const SESSION_KEY = 'active_store_id';

    /** The store this user works in now (memoised per request on the request attributes). */
    public static function for(?User $user, ?Request $request = null): ?Store
    {
        if (! $user) {
            return null;
        }
        if ($user->role === 'seller') {
            $request ??= request();
            $activeId = $request->hasSession() ? (int) $request->session()->get(self::SESSION_KEY) : 0;
            if ($activeId) {
                $store = Store::whereKey($activeId)->where('user_id', $user->id)->first();
                if ($store && ($store->status === 'approved' || ! $store->isBranch())) {
                    return $store;
                }
                $request->session()->forget(self::SESSION_KEY);   // not theirs / no longer approved → back to the main store
            }

            return static::mainFor($user);
        }
        if ($user->role === 'seller_staff') {
            return $user->store_id ? Store::find($user->store_id) : null;
        }

        return null;
    }

    /** The owner's MAIN store (registration, pending page, become-seller, User::ownedStore). */
    public static function mainFor(User|int $owner): ?Store
    {
        $id = $owner instanceof User ? $owner->id : $owner;

        return Store::where('user_id', $id)->whereNull('parent_store_id')->orderBy('id')->first();
    }

    /** Id of the owner's main store (one cheap query). */
    public static function mainIdFor(User|int $owner): ?int
    {
        $id = $owner instanceof User ? $owner->id : $owner;
        $v = Store::where('user_id', $id)->whereNull('parent_store_id')->orderBy('id')->value('id');

        return $v ? (int) $v : null;
    }

    /**
     * Every store the owner owns (main + branches), any status. "Is this customer the store owner" checks (cart, checkout,
     * product pages) must use this — an owner may not buy from any of their own stores.
     *
     * @return int[]
     */
    public static function ownedStoreIds(User|int|null $owner): array
    {
        if (! $owner) {
            return [];
        }
        $id = $owner instanceof User ? $owner->id : $owner;

        return Store::where('user_id', $id)->orderByRaw('parent_store_id IS NOT NULL')->orderBy('id')->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    /** The owner's approved stores (main first, then branches by name) — the switcher, the main dashboard. */
    public static function approvedStores(User|int $owner): \Illuminate\Support\Collection
    {
        $id = $owner instanceof User ? $owner->id : $owner;

        return Store::where('user_id', $id)->where('status', 'approved')
            ->orderByRaw('parent_store_id IS NOT NULL')->orderBy('branch_name')->orderBy('id')->get();
    }

    /** Switch an owner to one of their approved stores. False (nothing changed) when it isn't theirs or not approved. */
    public static function switchTo(User $owner, Store $store, ?Request $request = null): bool
    {
        if ($owner->role !== 'seller' || (int) $store->user_id !== (int) $owner->id || $store->status !== 'approved') {
            return false;
        }
        $request ??= request();
        if ($store->isBranch()) {
            $request->session()->put(self::SESSION_KEY, $store->id);
        } else {
            $request->session()->forget(self::SESSION_KEY);
        }

        return true;
    }

    /**
     * An owner's link may name the store it is about (?store=ID — e.g. a branch's notification): switch to it when it is
     * theirs and approved (anything else is ignored). Idempotent — called by HandleInertiaRequests (shared props are
     * built BEFORE the route middleware) and EnsureIsSeller.
     */
    public static function applyRequested(?User $user, Request $request): void
    {
        if (! $user || $user->role !== 'seller' || ! $request->hasSession()) {
            return;
        }
        // K9: …or the URL is about a record of another of the owner's stores (bookmark, email, notification, a main
        // dashboard list) → work in THAT store ("Switched to Imus Branch"). Staff never switch (they keep the 403).
        $wanted = (int) $request->query('store') ?: static::recordStoreId($request);
        if (! $wanted) {
            return;
        }
        $active = static::for($user, $request);
        if ($active && (int) $active->id === $wanted) {
            return;
        }
        $target = Store::find($wanted);
        if ($target && (int) $target->user_id === (int) $user->id && static::switchTo($user, $target, $request)) {
            $request->session()->now('info', "Switched to {$target->store_name}");
        }
    }

    /**
     * K9: the store of the record a seller URL is about — the route's bound models (orders, invoices, receipts,
     * deliveries, payroll, purchase orders, suppliers, supplier returns, products, staff, vehicles, refunds, customer
     * reports, batches …) or ?c= (a conversation) / ?batches= (a product). Null when the URL names no store record.
     */
    public static function recordStoreId(Request $request): ?int
    {
        $route = $request->route();
        foreach ($route ? $route->parameters() : [] as $name => $value) {
            $model = $value instanceof \Illuminate\Database\Eloquent\Model ? $value : static::resolveParam((string) $name, $value);
            if (! $model) {
                continue;
            }
            $id = match (true) {
                $model instanceof User => $model->role === 'seller_staff' ? $model->store_id : null,
                $model instanceof \App\Models\UserReport => $model->reported_store_id ?? null,
                $model instanceof Store => null,
                default => $model->getAttribute('store_id'),
            };
            if ($id) {
                return (int) $id;
            }
        }
        if (($c = (int) $request->query('c')) > 0) {
            return ($id = \App\Models\Conversation::whereKey($c)->value('store_id')) ? (int) $id : null;
        }
        if (($p = (int) $request->query('batches')) > 0) {
            return ($id = \App\Models\Product::withTrashed()->whereKey($p)->value('store_id')) ? (int) $id : null;
        }

        return null;
    }

    /** A route parameter that isn't bound yet (middleware order) → its record, for the usual seller parameter names. */
    private static function resolveParam(string $name, mixed $value): ?\Illuminate\Database\Eloquent\Model
    {
        if (! is_numeric($value)) {
            return null;
        }
        $class = [
            'order' => \App\Models\Order::class, 'invoice' => \App\Models\Invoice::class, 'receipt' => \App\Models\PaymentReceipt::class,
            'delivery' => \App\Models\Delivery::class, 'payroll' => \App\Models\Payroll::class, 'purchaseOrder' => \App\Models\PurchaseOrder::class,
            'supplier' => \App\Models\Supplier::class, 'supplierReturn' => \App\Models\SupplierReturn::class, 'product' => \App\Models\Product::class,
            'user' => User::class, 'vehicle' => \App\Models\Vehicle::class, 'refund' => \App\Models\RefundRequest::class,
            'refundRequest' => \App\Models\RefundRequest::class, 'userReport' => \App\Models\UserReport::class,
            'batch' => \App\Models\CylinderBatch::class, 'conversation' => \App\Models\Conversation::class,
            'incident' => \App\Models\CylinderIncident::class, 'document' => \App\Models\StaffDocument::class,
        ][$name] ?? null;
        if (! $class) {
            return null;
        }
        $q = $class::query();
        if (in_array(\Illuminate\Database\Eloquent\SoftDeletes::class, class_uses_recursive($class), true)) {
            $q->withTrashed();
        }

        return $q->find((int) $value);
    }

    /** Does the owner have at least one branch (any status)? */
    public static function hasBranches(User|int $owner): bool
    {
        $id = $owner instanceof User ? $owner->id : $owner;

        return Store::where('user_id', $id)->whereNotNull('parent_store_id')->exists();
    }

    /** Is this user the Branch Manager of their (branch) store? */
    public static function isBranchManager(?User $user): bool
    {
        return $user !== null && $user->role === 'seller_staff' && $user->store_id
            && \App\Services\StaffAccess::hasStarter($user, 'branch_manager');
    }

    /** May this user manage the store (staff, vehicles…): the owner, or the Branch Manager of that store. */
    public static function canManage(?User $user, ?Store $store): bool
    {
        if (! $user || ! $store) {
            return false;
        }
        if ($user->role === 'seller') {
            return (int) $store->user_id === (int) $user->id;
        }

        return static::isBranchManager($user) && (int) $user->store_id === (int) $store->id;
    }
}
