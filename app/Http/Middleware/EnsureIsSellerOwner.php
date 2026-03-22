<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Only the store owner (role=seller) may manage staff.
 * Seller_staff (cashier, warehouse, rider) cannot manage other staff members.
 */
class EnsureIsSellerOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== 'seller') {
            abort(403, 'Only the store owner can perform this action.');
        }

        return $next($request);
    }
}
