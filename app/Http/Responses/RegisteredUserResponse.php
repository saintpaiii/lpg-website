<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;

class RegisteredUserResponse implements RegisterResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        // /verify-otp sends the first code by itself, once (K3). K7: set BEFORE the JSON reply — the register page
        // posts with axios (Accept: application/json), so the flag was never set and customers had to click "Send".
        if ($request->hasSession()) {
            $request->session()->put(\App\Http\Controllers\OtpController::AUTOSEND_KEY, true);
        }

        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

        return redirect()->route('otp.show')
            ->with('success', 'Account created! We sent a 6-digit code to your email.');
    }
}
