<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A NEW "Continue with Google" user (users.needs_account_choice) must pick "I want to buy LPG" / "I only want to sell LPG"
 * first: every other page sends them to /choose-account. Seller only keeps the flag until the store application is
 * submitted. Admins / platform staff never have the flag (and are never redirected). Part of the web group (K1).
 */
class EnsureAccountChosen
{
    public const MESSAGE = 'Choose how you will use your account first.';

    /** Route names that stay reachable while the choice is open. */
    private const ALLOWED = [
        'account.choose', 'account.choose.store',
        // Seller only: the signed-in store application (+ its live name check and the map's address lookups)
        'seller.register', 'seller.register.store', 'seller.register.check-name',
        'api.geocode', 'api.reverse-geocode', 'api.barangay-coordinates',
        // Leaving, Google itself, legal pages / the Terms update popup
        'logout', 'auth.google', 'auth.google.callback',
        'legal.accept', 'legal.terms', 'legal.seller-terms', 'legal.privacy',
        // Email code / email verification / two-factor
        'otp.show', 'otp.verify', 'otp.resend',
        'verification.notice', 'verification.verify', 'verification.send',
        'two-factor.login', 'two-factor.login.store',
        // Private files (e.g. a document preview) and the Sanctum cookie
        'documents.show', 'sanctum.csrf-cookie', 'storage.local',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || ! $user->needs_account_choice || $user->isAdmin() || $user->is_platform_staff) {
            return $next($request);
        }

        $name = $request->route()?->getName();
        if ($name === null || in_array($name, self::ALLOWED, true)) {
            return $next($request);
        }

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => self::MESSAGE], 403);
        }

        return redirect()->route('account.choose');
    }
}
