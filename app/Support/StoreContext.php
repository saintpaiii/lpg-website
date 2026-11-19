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
        if (! $user || $user->role !== 'seller' || ! $request->hasSession() || ($wanted = (int) $request->query('store')) <= 0) {
            return;
        }
        if ((int) $request->session()->get(self::SESSION_KEY) === $wanted) {
            return;
        }
        $target = Store::find($wanted);
        if ($target) {
            static::switchTo($user, $target, $request);
        }
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
