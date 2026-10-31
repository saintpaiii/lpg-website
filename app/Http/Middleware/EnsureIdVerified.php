<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Customers can only shop (browse, cart, checkout, pay, apply as seller) once an admin
 * has approved their ID. Other roles using the customer portal are never blocked.
 *
 * 'id.verified:history' guards the history pages (orders, messages, invoices, …): those stay open
 * for customers who were verified before or have orders (e.g. verification revoked), and are only
 * blocked for brand-new customers who were never verified (User::isLockedNewcomer()).
 */
class EnsureIdVerified
{
    public const MESSAGE = 'Please verify your ID first. You can browse and order once an admin approves it.';

    public function handle(Request $request, Closure $next, string $mode = 'shop'): Response
    {
        $user = $request->user();

        if (! $user || $user->role !== 'customer' || $user->id_verification_status === 'verified') {
            return $next($request);
        }

        if ($mode === 'history') {
            if (! $user->isLockedNewcomer()) {
                return $next($request);
            }
            // The layout polls this — answer quietly instead of redirecting
            if ($request->routeIs('customer.messages.unread')) {
                return response()->json(['count' => 0]);
            }
        }

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return response()->json(['message' => self::MESSAGE], 403);
        }

        return redirect()->route('customer.id-verification')->with('info', self::MESSAGE);
    }
}
