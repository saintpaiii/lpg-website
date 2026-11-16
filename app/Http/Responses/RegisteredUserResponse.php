<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;

class RegisteredUserResponse implements RegisterResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

        // /verify-otp sends the first code by itself, once (K3)
        $request->session()->put(\App\Http\Controllers\OtpController::AUTOSEND_KEY, true);

        return redirect()->route('otp.show')
            ->with('success', 'Account created! We sent a 6-digit code to your email.');
    }
}
