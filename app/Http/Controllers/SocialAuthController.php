<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class SocialAuthController extends Controller
{
    public function redirectToGoogle()
    {
        return Socialite::driver('google')->redirect();
    }

    public function handleGoogleCallback()
    {
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
        } else {
            // New user — create a customer account
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
            ]);
        }

        Auth::login($user, true);

        // Role-based redirect (mirrors LoginResponse)
        $redirect = match (true) {
            $user->role === 'platform_staff'
                => $user->platformStaffHomeUrl(),

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

            $user->role === 'customer'
                => route('customer.products'),

            default => route('home'),
        };

        return redirect()->intended($redirect)
            ->with('success', 'Welcome, ' . $user->name . '!');
    }
}
