<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class SocialAuthController extends Controller
{
    /** Session key: Google was started from /seller/register (?intent=seller) — a new user goes straight to the seller form. */
    public const INTENT_KEY = 'google_signup_intent';

    public function redirectToGoogle(Request $request)
    {
        if ($request->query('intent') === 'seller') {
            $request->session()->put(self::INTENT_KEY, 'seller');
        } else {
            $request->session()->forget(self::INTENT_KEY);
        }

        return Socialite::driver('google')->redirect();
    }

    public function handleGoogleCallback(Request $request)
    {
        $intent = $request->session()->pull(self::INTENT_KEY);

        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (\Exception $e) {
            return redirect('/login')->withErrors(['email' => 'Google sign-in failed. Please try again.']);
        }

        $user = User::where('email', $googleUser->getEmail())->first();

        if ($user) {
            // Block admin/staff accounts from Google login
            if ($user->is_admin || $user->is_platform_staff) {
                return redirect('/login')->withErrors(['email' => 'Admin and staff accounts cannot use Google sign-in.']);
            }

            // Block deactivated accounts
            if (! $user->is_active) {
                $flash = [];
                if ($user->deactivation_reason) {
                    $flash['deactivation_info'] = [
                        'reason' => $user->deactivation_reason,
                        'notes'  => $user->deactivation_notes,
                    ];
                }
                return redirect('/login')->with($flash)->withErrors(['email' => 'Your account has been deactivated.']);
            }
            if ($user->paused_by_plan) {
                return redirect('/login')->withErrors(['email' => \App\Models\User::PAUSED_BY_PLAN_MESSAGE]);
            }
        } else {
            // New user — a customer account as before, but they must still pick buyer / seller-only on /choose-account
            $nameParts = explode(' ', trim($googleUser->getName() ?? ''), 2);
            $firstName = $nameParts[0] ?? '';
            $lastName  = $nameParts[1] ?? '';

            $user = User::create([
                'first_name'        => $firstName,
                'last_name'         => $lastName,
                'name'              => $googleUser->getName(),
                'email'             => $googleUser->getEmail(),
                'password'          => bcrypt(Str::random(32)),
                'role'              => 'customer',
                'is_active'         => true,
                'is_admin'          => false,
                'is_platform_staff' => false,
                'email_verified_at' => now(),
                'can_shop'          => true,
                'needs_account_choice' => true,
            ]);
        }

        Auth::login($user, true);

        // Hasn't chosen yet (new now, or closed the page last time): seller form when started from /seller/register
        if ($user->needs_account_choice) {
            return $intent === 'seller'
                ? redirect()->route('seller.register')->with('success', "Signed in with Google as {$user->email}. Fill in your store details.")
                : redirect()->route('account.choose')->with('success', 'Welcome, ' . $user->name . '! Choose how you will use your account.');
        }

        // Customers whose ID isn't approved yet go straight to identity verification
        if ($user->role === 'customer' && $user->id_verification_status !== 'verified') {
            return redirect(route('customer.id-verification'))
                ->with('success', 'Welcome, ' . $user->name . '! Please complete identity verification to place orders.');
        }

        // Role-based redirect (mirrors LoginResponse)
        $redirect = $user->role === 'customer' ? route('customer.products') : $user->homeUrl();

        return redirect()->intended($redirect)
            ->with('success', 'Welcome, ' . $user->name . '!');
    }
}
