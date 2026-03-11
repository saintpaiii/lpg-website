<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

class LoginResponse implements LoginResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        $user = $request->user();

        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

        $redirect = match ($user->role) {
            'admin', 'manager' => route('admin.dashboard'),
            'cashier'          => route('admin.invoices'),
            'warehouse'        => route('admin.inventory'),
            'rider'            => route('rider.deliveries'),
            'customer'         => route('customer.dashboard'),
            default            => route('home'),
        };

        return redirect()->intended($redirect);
    }
}
