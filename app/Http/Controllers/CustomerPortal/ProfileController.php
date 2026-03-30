<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    private function getCustomer(Request $request): ?Customer
    {
        return Customer::where('user_id', $request->user()->id)->first();
    }

    public function edit(Request $request): Response
    {
        $user     = $request->user();
        $customer = $this->getCustomer($request);

        return Inertia::render('customer/profile', [
            'profile' => [
                'name'     => $user->name,
                'email'    => $user->email,
                'phone'    => $customer?->phone ?? $user->phone,
                'address'  => $customer?->address ?? '',
                'city'     => $customer?->city ?? '',
                'barangay' => $customer?->barangay ?? '',
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'phone'    => ['required', 'string', 'regex:/^09\d{9}$/'],
            'address'  => 'required|string|max:500',
            'city'     => 'required|string|max:100',
            'barangay' => 'nullable|string|max:100',
        ]);

        $user = $request->user();
        $user->update(['name' => $data['name'], 'phone' => $data['phone']]);

        $customer = $this->getCustomer($request);
        if ($customer) {
            $customer->update([
                'name'     => $data['name'],
                'phone'    => $data['phone'],
                'address'  => $data['address'],
                'city'     => $data['city'],
                'barangay' => $data['barangay'] ?? '',
            ]);
        }

        return back()->with('success', 'Profile updated successfully.');
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_password'      => 'required|string',
            'password'              => ['required', 'confirmed', Password::defaults()],
            'password_confirmation' => 'required|string',
        ]);

        if (! Hash::check($data['current_password'], $request->user()->password)) {
            return back()->withErrors(['current_password' => 'The current password is incorrect.']);
        }

        $request->user()->update(['password' => $data['password']]);

        return back()->with('success', 'Password updated successfully.');
    }
}
