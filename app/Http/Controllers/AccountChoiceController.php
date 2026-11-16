<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * /choose-account — a NEW "Continue with Google" user picks "I want to buy LPG" or "I only want to sell LPG".
 * Customer → flag cleared → ID verification (as before). Seller only → /seller/register in signed-in mode; the flag stays
 * until the store application is submitted, so closing the tab brings them back here.
 */
class AccountChoiceController extends Controller
{
    public function show(Request $request): Response|RedirectResponse
    {
        $user = $request->user();
        if (! $user->needs_account_choice) {
            return redirect($user->homeUrl());
        }

        return Inertia::render('auth/choose-account', [
            'name'  => $user->name,
            'email' => $user->email,
        ]);
    }

    public function choose(Request $request): RedirectResponse
    {
        $user = $request->user();
        if (! $user->needs_account_choice) {
            return redirect($user->homeUrl());
        }

        $data = $request->validate(['type' => ['required', 'in:customer,seller']]);

        if ($data['type'] === 'seller') {
            return redirect()->route('seller.register');
        }

        $user->forceFill(['needs_account_choice' => false])->save();

        return redirect()->route('customer.id-verification')
            ->with('success', 'Welcome, ' . $user->name . '! Please complete identity verification to place orders.');
    }
}
