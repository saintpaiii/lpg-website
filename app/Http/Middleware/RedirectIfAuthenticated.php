<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RedirectIfAuthenticated
{
    public function handle(Request $request, Closure $next, string ...$guards): Response
    {
        $guards = empty($guards) ? [null] : $guards;

        foreach ($guards as $guard) {
            if (Auth::guard($guard)->check()) {
                return redirect($this->redirectTo($request));
            }
        }

        return $next($request);
    }

    protected function redirectTo(Request $request): string
    {
        $user = $request->user();

        if (! $user) {
            return '/';
        }

        if ($user->role === 'seller_staff') {
            return match ($user->sub_role) {
                'rider'     => '/rider/deliveries',
                'warehouse' => '/seller/inventory',
                default     => '/seller/dashboard',
            };
        }

        return match ($user->role) {
            'platform_admin', 'admin', 'manager' => '/admin/dashboard',
            'cashier'                             => '/admin/invoices',
            'warehouse'                           => '/admin/inventory',
            'rider'                               => '/rider/deliveries',
            'seller'                              => '/seller/dashboard',
            default                               => '/customer/dashboard',
        };
    }
}
