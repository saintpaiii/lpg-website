<?php

namespace App\Http\Middleware;

use App\Models\RolePermission;
use App\Models\UserPermission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureIsAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()) {
            return redirect()->route('login');
        }

        $user = $request->user();

        if (! $user->is_active) {
            $reason = $user->deactivation_reason;
            $notes  = $user->deactivation_notes;
            auth()->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            return redirect()->route('login')
                ->withErrors(['email' => 'Your account has been deactivated.'])
                ->with('deactivation_info', ['reason' => $reason, 'notes' => $notes]);
        }

        // Standard staff roles always have access (includes platform_admin, seller, seller_staff).
        if ($user->isStaff()) {
            return $next($request);
        }

        // Non-staff users designated as platform staff get access.
        if ($user->is_platform_staff) {
            return $next($request);
        }

        // Non-staff (rider, customer, etc.) are allowed through if an admin has
        // explicitly granted them at least one permission that is NOT in their
        // role's default set — i.e. a meaningful cross-role override.
        $rolePermIds = RolePermission::where('role', $user->role)
            ->pluck('permission_id')
            ->toArray();

        $hasCrossRoleGrant = UserPermission::where('user_id', $user->id)
            ->where('granted', true)
            ->whereNotIn('permission_id', $rolePermIds)
            ->exists();

        if ($hasCrossRoleGrant) {
            return $next($request);
        }

        return redirect()->route('login')->withErrors([
            'email' => 'You do not have access to this area.',
        ]);
    }
}
