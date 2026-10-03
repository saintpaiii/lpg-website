<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Http\Controllers\BarangayCoordinateController;
use App\Models\Customer;
use App\Models\CustomerAddress;
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
        // The profile address is the customer's "Home" saved address (what checkout pre-selects)
        $home = static::homeAddress($user->id);

        return Inertia::render('customer/profile', [
            'profile' => [
                'first_name'  => $user->first_name ?? '',
                'middle_name' => $user->middle_name ?? '',
                'last_name'   => $user->last_name ?? '',
                'email'       => $user->email,
                'phone'       => $customer?->phone ?? $user->phone,
                'address'     => $customer?->address ?? '',
                'city'        => $customer?->city ?? '',
                'barangay'    => $customer?->barangay ?? '',
                'latitude'    => $home?->latitude ?? ($customer?->latitude !== null ? (float) $customer->latitude : null),
                'longitude'   => $home?->longitude ?? ($customer?->longitude !== null ? (float) $customer->longitude : null),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'first_name'  => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name'   => 'required|string|max:255',
            'phone'       => ['nullable', 'string', 'regex:/^09\d{9}$/'],
            'address'     => 'required|string|max:500',
            'city'        => 'required|string|max:100',
            'barangay'    => 'nullable|string|max:100',
            // Delivery pin (draggable on the profile map) — Philippines bounds
            'latitude'    => 'nullable|numeric|between:4,22|required_with:longitude',
            'longitude'   => 'nullable|numeric|between:116,127|required_with:latitude',
        ]);
        // No pin: place it at the barangay (or city) centre
        $pin = isset($data['latitude'], $data['longitude'])
            ? [(float) $data['latitude'], (float) $data['longitude']]
            : BarangayCoordinateController::addressPoint($data['city'], $data['barangay'] ?? null);

        $fullName = trim(
            $data['first_name']
            . ($data['middle_name'] ? ' ' . $data['middle_name'] : '')
            . ' ' . $data['last_name']
        );

        $user = $request->user();
        $user->update([
            'name'        => $fullName,
            'first_name'  => $data['first_name'],
            'middle_name' => $data['middle_name'] ?? null,
            'last_name'   => $data['last_name'],
            'phone'       => $data['phone'] ?? null,
        ]);

        $customer = $this->getCustomer($request);
        if ($customer) {
            $customer->update([
                'name'     => $fullName,
                'phone'    => $data['phone'] ?? $customer->phone,
                'address'  => $data['address'],
                'city'     => $data['city'],
                'barangay' => $data['barangay'] ?? '',
                'latitude'  => $pin[0] ?? null,
                'longitude' => $pin[1] ?? null,
            ]);
        } else {
            // Google-registered users have no Customer record yet — create one now
            Customer::create([
                'user_id'       => $user->id,
                'name'          => $fullName,
                'email'         => $user->email,
                'phone'         => $data['phone'] ?? '',
                'address'       => $data['address'],
                'city'          => $data['city'],
                'barangay'      => $data['barangay'] ?? '',
                'latitude'      => $pin[0] ?? null,
                'longitude'     => $pin[1] ?? null,
                'customer_type' => 'household',
            ]);
        }

        // Keep the "Home" saved address in step with the profile (checkout pre-selects it)
        $home = static::homeAddress($user->id);
        $homeData = [
            'address_line' => $data['address'],
            'barangay'     => ($data['barangay'] ?? '') ?: null,
            'city'         => $data['city'],
            'latitude'     => $pin[0] ?? null,
            'longitude'    => $pin[1] ?? null,
        ];
        if ($home) {
            $home->update($homeData);
        } else {
            CustomerAddress::create($homeData + [
                'user_id'    => $user->id,
                'label'      => 'Home',
                'is_default' => ! CustomerAddress::where('user_id', $user->id)->where('is_default', true)->exists(),
            ]);
        }

        return back()->with('success', 'Profile updated successfully.');
    }

    /** The saved address labelled "Home" (the default one first), if any. */
    private static function homeAddress(int $userId): ?CustomerAddress
    {
        return CustomerAddress::where('user_id', $userId)->where('label', 'Home')
            ->orderByDesc('is_default')->orderBy('id')->first();
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
