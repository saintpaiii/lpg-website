<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureIsCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()) {
            return redirect()->route('login');
        }

        $user = $request->user();

        // Sellers can also access the customer portal (they were customers first).
        // Platform admins can access for preview/banner management.
        if (! in_array($user->role, ['customer', 'seller', 'platform_admin', 'admin'])) {
            abort(403, 'Access denied.');
        }

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

        // Seller-only account (registered on /seller/register): no Customer Portal, no cart, no orders
        if ($user->isSellerOnly()) {
            $message = "This is a seller-only account — it can't place orders.";
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json(['message' => $message], 403);
            }

            return redirect()->route('seller.dashboard')->with('error', $message);
        }

        return $next($request);
    }
}
