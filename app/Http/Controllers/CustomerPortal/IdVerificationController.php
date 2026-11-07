<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Rules\InServiceArea;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Inertia\Inertia;
use Inertia\Response;

class IdVerificationController extends Controller
{
    private const DETAILS_MESSAGE = 'Please complete your details first.';

    /** Phone, street address, city and barangay are all on file. */
    public static function detailsComplete(User $user): bool
    {
        $customer = Customer::where('user_id', $user->id)->first();

        return filled($customer?->phone ?: $user->phone)
            && filled($customer?->address)
            && filled($customer?->city)
            && filled($customer?->barangay);
    }

    /** POST /customer/id-verification/details — Step 1 "Your details" (name, mobile, home address). */
    public function details(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->id_verification_status === 'verified') {
            return redirect('/customer/products');
        }

        $data = $request->validate([
            'first_name'  => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name'   => 'required|string|max:255',
            'phone'       => ['required', 'string', 'regex:/^09\d{9}$/'],
            'address'     => 'required|string|max:500',
            'city'        => 'required|string|max:100',
            'barangay'    => 'required|string|max:100',
            // Home pin — must be inside Cavite
            'latitude'    => ['nullable', 'numeric', 'between:4,22', 'required_with:longitude', new InServiceArea('longitude')],
            'longitude'   => 'nullable|numeric|between:116,127|required_with:latitude',
        ], [
            'phone.required' => 'Please enter your mobile number.',
            'phone.regex'    => 'Enter an 11-digit mobile number starting with 09 (e.g. 09171234567).',
            'address.required'  => 'Please enter your house no. and street.',
            'city.required'     => 'Please choose your city / municipality.',
            'barangay.required' => 'Please choose your barangay.',
        ]);
        $data['middle_name'] ??= null;

        ProfileController::saveDetails($user, $data);
        // The default saved address checkout pre-selects (no-op when saveDetails already made "Home")
        AddressController::ensureDefaultFromProfile($user->id, Customer::where('user_id', $user->id)->first());

        return redirect('/customer/id-verification')->with('success', 'Details saved. Next, upload your ID and a selfie.');
    }

    /** GET /customer/id-verification */
    public function create(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        if ($user->id_verification_status === 'verified') {
            return redirect('/customer/products')
                ->with('success', 'Your identity is already verified.');
        }

        $hasPending = VerificationRequest::where('user_id', $user->id)
            ->where('type', 'customer_id_verification')
            ->where('status', 'pending')
            ->exists();

        $customer = Customer::where('user_id', $user->id)->first();
        $home = CustomerAddress::where('user_id', $user->id)->where('label', 'Home')
            ->orderByDesc('is_default')->orderBy('id')->first();

        return Inertia::render('customer/id-verification', [
            // Step 1 "Your details" — skipped when everything is already filled in
            'details'          => [
                'first_name'  => $user->first_name ?? '',
                'middle_name' => $user->middle_name ?? '',
                'last_name'   => $user->last_name ?? '',
                'phone'       => $customer?->phone ?: ($user->phone ?? ''),
                'address'     => $customer?->address ?? '',
                'city'        => $customer?->city ?? '',
                'barangay'    => $customer?->barangay ?? '',
                'latitude'    => $home?->latitude ?? ($customer?->latitude !== null ? (float) $customer->latitude : null),
                'longitude'   => $home?->longitude ?? ($customer?->longitude !== null ? (float) $customer->longitude : null),
            ],
            'details_complete' => static::detailsComplete($user),
            'status'           => $user->id_verification_status,
            'rejection_reason' => $user->id_rejection_reason,
            'has_pending'      => $hasPending,
            'valid_id_url'     => \App\Support\PrivateDocument::urlIf($user->valid_id_path, 'user', $user->id, 'valid_id_path'),
            'selfie_url'       => \App\Support\PrivateDocument::urlIf($user->selfie_path, 'user', $user->id, 'selfie_path'),
        ]);
    }

    /** POST /customer/id-verification */
    public function store(Request $request): RedirectResponse|JsonResponse
    {
        $user = $request->user();

        if ($user->id_verification_status === 'verified') {
            return redirect('/customer/products');
        }

        // The admin needs a phone number and home address to review the ID against
        if (! static::detailsComplete($user)) {
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return response()->json([
                    'message' => self::DETAILS_MESSAGE,
                    'errors'  => ['details' => [self::DETAILS_MESSAGE]],
                ], 422);
            }

            return back()->with('error', self::DETAILS_MESSAGE);
        }

        $request->validate([
            'valid_id' => ['required', File::types(['jpg', 'jpeg', 'png', 'webp', 'pdf'])->max(5 * 1024)],
            'selfie'   => ['required', File::types(['jpg', 'jpeg', 'png', 'webp'])->max(5 * 1024)],
        ], [
            'valid_id.required' => 'Please upload a photo of your valid ID.',
            'selfie.required'   => 'Please provide a selfie photo.',
        ] + \App\Support\UploadMessages::for(['valid_id']) + \App\Support\UploadMessages::for(['selfie'], false));

        // Store uploaded files
        // Private ('local' disk) — only the customer and document reviewers can open them
        $validIdPath = $request->file('valid_id')->store('verifications/ids', 'local');
        $selfiePath  = $request->file('selfie')->store('verifications/selfies', 'local');

        // Update user record
        $user->update([
            'valid_id_path'          => $validIdPath,
            'selfie_path'            => $selfiePath,
            'id_verification_status' => 'pending',
            'id_rejection_reason'    => null,
        ]);

        // Soft-delete any prior rejected requests, then create a fresh one
        VerificationRequest::where('user_id', $user->id)
            ->where('type', 'customer_id_verification')
            ->whereIn('status', ['pending', 'rejected'])
            ->delete();

        VerificationRequest::create([
            'user_id'       => $user->id,
            'type'          => 'customer_id_verification',
            'valid_id_path' => $validIdPath,
            'selfie_path'   => $selfiePath,
            'status'        => 'pending',
        ]);

        // Notify platform admins
        foreach (['platform_admin', 'admin'] as $role) {
            NotificationService::sendToRole(
                $role,
                'system',
                'New ID Verification Submitted',
                "{$user->name} has submitted their identity documents for verification.",
                ['link' => '/admin/verifications']
            );
        }

        return redirect('/customer/id-verification')
            ->with('success', "Your identity documents have been submitted. We'll notify you as soon as it's approved — usually within 24 hours.");
    }
}
