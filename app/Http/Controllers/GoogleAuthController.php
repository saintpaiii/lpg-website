<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    /**
     * Redirect the user to Google's OAuth page.
     */
    public function redirect()
    {
        return Socialite::driver('google')->redirect();
    }

    /**
     * Handle the callback from Google.
     */
    public function callback()
    {
        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (\Exception $e) {
            return redirect('/login')->withErrors(['email' => 'Google sign-in failed. Please try again.']);
        }

        // Find or create user by email
        $user = User::where('email', $googleUser->getEmail())->first();

        if ($user) {
            // Existing user — block staff/admin accounts from using Google login
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
        } else {
            // New user — create a customer account
            $nameParts = explode(' ', trim($googleUser->getName()), 2);
            $firstName = $nameParts[0] ?? '';
            $lastName  = $nameParts[1] ?? '';

            $user = User::create([
                'first_name'        => $firstName,
                'last_name'         => $lastName,
                'name'              => $googleUser->getName(),
                'email'             => $googleUser->getEmail(),
                'password'          => bcrypt(\Str::random(32)),
                'role'              => 'customer',
                'is_active'         => true,
                'is_admin'          => false,
                'is_platform_staff' => false,
                'email_verified_at' => now(),
            ]);
        }

        Auth::login($user, true);

        return redirect()->intended('/');
    }
}
