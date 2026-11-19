<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\StoreContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * J9 — store_manager: the store owner, or the Branch Manager of the active (branch) store. A Branch Manager never acts
 * on their own account here (their roles / access come from the owner).
 */
class EnsureStoreManager
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $store = $request->attributes->get('seller_store');
        if (! StoreContext::canManage($user, $store)) {
            abort(403, 'Only the store owner can perform this action.');
        }
        if ($user->role !== 'seller') {
            $target = $request->route('user');
            $targetId = $target instanceof User ? $target->id : (is_numeric($target) ? (int) $target : null);
            if ($targetId === $user->id) {
                abort(403, 'Ask the store owner to change your own account.');
            }
        }

        return $next($request);
    }
}
