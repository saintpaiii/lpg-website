<?php

namespace App\Http\Responses;

use App\Mail\OtpMail;
use App\Models\OtpCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Mail;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;

class RegisteredUserResponse implements RegisterResponseContract
{
    public function toResponse($request): RedirectResponse|JsonResponse
    {
        if ($request->wantsJson()) {
            return response()->json(['two_factor' => false]);
        }

        // Generate OTP and send verification email
        $user = $request->user();
        $otp  = OtpCode::generateFor($user);
        Mail::to($user->email)->send(new OtpMail($user, $otp->code));

        return redirect()->route('otp.show')
            ->with('success', 'Account created! Please check your email for your verification code.');
    }
}
