<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    /**
     * Redirect users who must change their password to the password settings page.
     * Allows access to the password change route itself to avoid redirect loops.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->must_change_password) {
            // Allow the password update route itself to proceed
            if ($request->is('settings/password') || $request->routeIs('password.update')) {
                return $next($request);
            }

            return redirect('/settings/password')
                ->with('error', 'You must change your password before continuing.');
        }

        return $next($request);
    }
}
