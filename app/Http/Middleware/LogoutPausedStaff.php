<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Store staff paused by the plan's staff limit are logged out on ANY page (not only seller/rider routes).
 */
class LogoutPausedStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->role === 'seller_staff' && $user->paused_by_plan) {
            auth()->guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json(['message' => User::PAUSED_BY_PLAN_MESSAGE], 403);
            }

            return redirect()->route('login')->withErrors(['email' => User::PAUSED_BY_PLAN_MESSAGE]);
        }

        return $next($request);
    }
}
