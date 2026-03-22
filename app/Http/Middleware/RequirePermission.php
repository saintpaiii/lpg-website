<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    /**
     * Enforce a named permission.
     *
     * - Actual admins (isAdmin) always pass.
     * - Actual store owners (role=seller) always pass their seller routes.
     * - Everyone else (platform_staff, seller_staff, old staff roles) must have
     *   the named permission via hasPermission(), which checks user_permissions
     *   overrides → role_permissions fallback.
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (! $user) {
            return redirect()->route('login');
        }

        if ($user->isAdmin()) {
            return $next($request);
        }

        if ($user->isSeller()) {
            return $next($request);
        }

        if (! $user->hasPermission($permission)) {
            abort(403);
        }

        return $next($request);
    }
}
