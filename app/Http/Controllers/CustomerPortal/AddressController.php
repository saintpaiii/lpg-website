<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\BarangayCoordinateController;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The customer's saved delivery addresses. Every action is scoped to the signed-in user.
 * Write actions answer JSON for the checkout widget (Accept: application/json) and
 * redirect back for the Inertia addresses page.
 */
class AddressController extends Controller
{
    public function index(Request $request): Response
    {
        static::ensureDefaultFromProfile($request->user()->id, Customer::where('user_id', $request->user()->id)->first());

        return Inertia::render('customer/addresses', [
            'addresses' => static::listFor($request->user()->id),
            'labels'    => CustomerAddress::LABELS,
        ]);
    }

    public function store(Request $request): RedirectResponse|JsonResponse
    {
        $data  = $this->validated($request);
        $first = ! CustomerAddress::where('user_id', $request->user()->id)->exists();

        $address = CustomerAddress::create($data + [
            'user_id'    => $request->user()->id,
            'is_default' => $first || ! empty($data['is_default']),   // first address is always the default
        ]);

        return $this->respond($request, $address, 'Address saved.');
    }

    public function update(Request $request, CustomerAddress $address): RedirectResponse|JsonResponse
    {
        $this->authorizeOwner($request, $address);
        $data = $this->validated($request);
        // Un-ticking "default" on the current default would leave none — keep it until another is chosen
        if ($address->is_default) {
            unset($data['is_default']);
        }
        $address->update($data);

        return $this->respond($request, $address, 'Address updated.');
    }

    public function destroy(Request $request, CustomerAddress $address): RedirectResponse|JsonResponse
    {
        $this->authorizeOwner($request, $address);
        $address->delete();

        return $request->wantsJson()
            ? response()->json(['addresses' => static::listFor($request->user()->id)])
            : back()->with('success', 'Address removed.');
    }

    public function setDefault(Request $request, CustomerAddress $address): RedirectResponse|JsonResponse
    {
        $this->authorizeOwner($request, $address);
        $address->update(['is_default' => true]);

        return $this->respond($request, $address, "\"{$address->label}\" is now your default address.");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * A customer with no saved addresses gets their profile address as the default "Home"
     * (pinned from barangay_coordinates — never from the profile's own lat/lng).
     */
    public static function ensureDefaultFromProfile(int $userId, ?Customer $customer): void
    {
        if (! $customer || ! $customer->city || CustomerAddress::withTrashed()->where('user_id', $userId)->exists()) {
            return;
        }
        $at = BarangayCoordinateController::addressPoint($customer->city, $customer->barangay);
        CustomerAddress::create([
            'user_id'      => $userId,
            'label'        => 'Home',
            'address_line' => $customer->address ?: ($customer->barangay ?: $customer->city),
            'barangay'     => $customer->barangay ?: null,
            'city'         => $customer->city,
            'latitude'     => $at[0] ?? null,
            'longitude'    => $at[1] ?? null,
            'is_default'   => true,
        ]);
    }

    /** Saved addresses, default first. Missing coordinates are filled from the barangay lookup for display. */
    public static function listFor(int $userId): array
    {
        return CustomerAddress::where('user_id', $userId)
            ->orderByDesc('is_default')->orderBy('label')->orderBy('id')
            ->get()
            ->map(function (CustomerAddress $a) {
                $row = $a->toFrontend();
                if ($row['latitude'] === null && ($at = BarangayCoordinateController::addressPoint($a->city, $a->barangay))) {
                    [$row['latitude'], $row['longitude']] = $at;
                }
                return $row;
            })->all();
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'label'        => ['required', 'string', 'max:50'],
            'address_line' => ['required', 'string', 'max:255'],
            'barangay'     => ['nullable', 'string', 'max:100'],
            'city'         => ['nullable', 'string', 'max:100'],
            'latitude'     => ['nullable', 'numeric', 'between:4,22', 'required_with:longitude'],      // Philippines
            'longitude'    => ['nullable', 'numeric', 'between:116,127', 'required_with:latitude'],
            'is_default'   => ['sometimes', 'boolean'],
        ]);

        // No pin given: place it at the barangay (or city) centre so the address is still routable
        if (empty($data['latitude']) && ($at = BarangayCoordinateController::addressPoint($data['city'] ?? null, $data['barangay'] ?? null))) {
            [$data['latitude'], $data['longitude']] = $at;
        }

        return $data;
    }

    private function authorizeOwner(Request $request, CustomerAddress $address): void
    {
        abort_unless($address->user_id === $request->user()->id, 404);
    }

    private function respond(Request $request, CustomerAddress $address, string $message): RedirectResponse|JsonResponse
    {
        if ($request->wantsJson()) {
            return response()->json([
                'address'   => $address->fresh()->toFrontend(),
                'addresses' => static::listFor($request->user()->id),
                'message'   => $message,
            ]);
        }

        return back()->with('success', $message);
    }
}
