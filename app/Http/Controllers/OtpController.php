<?php

namespace App\Http\Controllers;

use App\Mail\OtpMail;
use App\Models\OtpCode;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class OtpController extends Controller
{
    /**
     * Show the OTP entry page.
     * Does NOT auto-send — user must click "Send Verification Code" first.
     */
    public function show(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        // Already verified — redirect to appropriate dashboard
        if ($user->hasVerifiedEmail()) {
            return redirect($this->dashboardRoute($user));
        }

        $activeOtp = OtpCode::latestActiveFor($user);
        $codeSent  = $activeOtp !== null;
        $expiresIn = $codeSent ? max(0, (int) now()->diffInSeconds($activeOtp->expires_at, false)) : 0;

        return Inertia::render('auth/verify-otp', [
            'email'            => $user->email,
            'resend_available' => $this->resendAvailableIn($user->id),
            'code_expires_in'  => $expiresIn,
            'code_sent'        => $codeSent,
        ]);
    }

    /**
     * Verify the submitted OTP code.
     */
    public function verify(Request $request): RedirectResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return redirect($this->dashboardRoute($user));
        }

        $throttleKey = 'otp-verify:' . $user->id;

        // Find the latest code for this user (used or not — we check state below)
        $otp = OtpCode::where('user_id', $user->id)
            ->where('used', false)
            ->latest()
            ->first();

        // No code exists at all
        if (! $otp) {
            return back()->withErrors(['code' => 'No verification code found. Please request a new one.']);
        }

        // Check lock
        if ($otp->isLocked()) {
            $minutesLeft = (int) ceil(now()->diffInSeconds($otp->locked_until) / 60);
            return back()->withErrors([
                'code' => "Too many attempts. Try again in {$minutesLeft} minute(s).",
            ]);
        }

        // Expired
        if ($otp->isExpired()) {
            return back()->withErrors(['code' => 'This code has expired. Please request a new one.']);
        }

        // Wrong code — increment attempts
        if (! hash_equals($otp->code, $request->input('code'))) {
            $otp->increment('attempts');

            if ($otp->attempts >= 5) {
                $otp->update(['locked_until' => now()->addMinutes(15)]);
                return back()->withErrors([
                    'code' => 'Too many failed attempts. Please wait 15 minutes or request a new code.',
                ]);
            }

            $remaining = 5 - $otp->attempts;
            return back()->withErrors([
                'code' => "Invalid code. {$remaining} attempt(s) remaining.",
            ]);
        }

        // ✓ Valid — mark used and verify email
        $otp->update(['used' => true]);
        $user->markEmailAsVerified();

        return redirect($this->dashboardRoute($user))
            ->with('success', 'Email verified successfully! Welcome, ' . $user->name . '!');
    }

    /**
     * Resend a fresh OTP code.
     */
    public function resend(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return redirect($this->dashboardRoute($user));
        }

        $throttleKey = 'otp-resend:' . $user->id;

        if (RateLimiter::tooManyAttempts($throttleKey, 3)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return back()->withErrors([
                'resend' => "Please wait {$seconds} second(s) before requesting another code.",
            ]);
        }

        RateLimiter::hit($throttleKey, 60); // 3 per 60 seconds

        $otp = OtpCode::generateFor($user);
        Mail::to($user->email)->send(new OtpMail($user, $otp->code));

        return back()->with('success', 'A new verification code has been sent to your email.');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function dashboardRoute($user): string
    {
        return match (true) {
            in_array($user->role, ['platform_admin', 'admin', 'manager'])
                => route('admin.dashboard'),
            $user->role === 'seller'
                => route('seller.dashboard'),
            $user->role === 'seller_staff' && $user->sub_role === 'rider'
                => route('rider.deliveries'),
            $user->role === 'seller_staff' && $user->sub_role === 'warehouse'
                => route('seller.inventory'),
            $user->role === 'seller_staff'
                => route('seller.invoices'),
            $user->role === 'cashier'
                => route('admin.invoices'),
            $user->role === 'warehouse'
                => route('admin.inventory'),
            $user->role === 'rider'
                => route('rider.deliveries'),
            default
                => route('customer.dashboard'),
        };
    }

    /**
     * How many seconds until a resend is available (0 = available now).
     */
    private function resendAvailableIn(int $userId): int
    {
        $throttleKey = 'otp-resend:' . $userId;
        if (RateLimiter::tooManyAttempts($throttleKey, 3)) {
            return RateLimiter::availableIn($throttleKey);
        }
        return 0;
    }
}
