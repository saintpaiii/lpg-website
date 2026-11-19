<?php

namespace App\Http\Controllers;

use App\Mail\OtpMail;
use App\Models\OtpCode;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class OtpController extends Controller
{
    /** Session flag set right after registration (customer or seller): the first code is sent automatically, once. */
    public const AUTOSEND_KEY = 'otp_autosend';

    /** Seconds between "Resend Code" clicks shown on the page. */
    private const RESEND_COOLDOWN = 60;

    /**
     * Show the OTP entry page. Right after registration the first code is sent by itself (once — a reload doesn't send
     * another); otherwise the user clicks "Send Verification Code".
     */
    public function show(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        // Already verified — redirect to appropriate dashboard
        if ($user->hasVerifiedEmail()) {
            return redirect($this->dashboardRoute($user));
        }

        $sendError = null;
        if ($request->session()->pull(self::AUTOSEND_KEY) && ! OtpCode::latestActiveFor($user)) {
            RateLimiter::hit('otp-resend:' . $user->id, 60);
            if (! $this->sendCode($user)) {
                RateLimiter::clear('otp-resend:' . $user->id);
                $sendError = "We couldn't send the code right now — click \"Send Verification Code\" to try again.";
            }
        }

        $activeOtp = OtpCode::latestActiveFor($user);
        $codeSent  = $activeOtp !== null;
        $expiresIn = $codeSent ? max(0, (int) now()->diffInSeconds($activeOtp->expires_at, false)) : 0;
        // Resend cooldown counts from the last code sent (also the automatic one)
        $sinceSent = $codeSent ? (int) $activeOtp->created_at->diffInSeconds(now()) : self::RESEND_COOLDOWN;

        return Inertia::render('auth/verify-otp', [
            'email'            => $user->email,
            'resend_available' => max($this->resendAvailableIn($user->id), self::RESEND_COOLDOWN - $sinceSent, 0),
            'send_error'       => $sendError,
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

        // New customers are prompted to verify their identity before accessing the portal
        if ($user->role === 'customer' && $user->id_verification_status !== 'verified') {
            return redirect(route('customer.id-verification'))
                ->with('success', 'Email verified! Please complete identity verification to place orders.');
        }

        // A seller whose store isn't approved yet: straight to the waiting page (not via the dashboard → the welcome
        // message would be lost in the second redirect)
        if ($user->role === 'seller' && (($main = \App\Support\StoreContext::mainFor($user)) && $main->status !== 'approved')) {
            return redirect()->route('seller.pending')->with('success', 'Email verified! Your store application is being reviewed.');
        }

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

        if (! $this->sendCode($user)) {
            RateLimiter::clear($throttleKey);     // don't use up a resend attempt
            return back()->withErrors(['resend' => "We couldn't send the code right now, please try again."]);
        }

        return back()->with('success', 'A new verification code has been sent to your email.');
    }

    /** New code + email; false when the email failed (the code is deleted so no countdown starts for it). */
    private function sendCode($user): bool
    {
        $otp = OtpCode::generateFor($user);
        try {
            Mail::to($user->email)->send(new OtpMail($user, $otp->code));
        } catch (\Throwable $e) {
            Log::warning('OTP email failed', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            $otp->delete();

            return false;
        }

        return true;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function dashboardRoute($user): string
    {
        return $user->homeUrl();
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
