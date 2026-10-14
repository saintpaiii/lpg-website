<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Http\Controllers\Controller;
use App\Models\VerificationRequest;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\File;
use Inertia\Inertia;
use Inertia\Response;

class IdVerificationController extends Controller
{
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

        return Inertia::render('customer/id-verification', [
            'status'           => $user->id_verification_status,
            'rejection_reason' => $user->id_rejection_reason,
            'has_pending'      => $hasPending,
            'valid_id_url'     => \App\Support\PrivateDocument::urlIf($user->valid_id_path, 'user', $user->id, 'valid_id_path'),
            'selfie_url'       => \App\Support\PrivateDocument::urlIf($user->selfie_path, 'user', $user->id, 'selfie_path'),
        ]);
    }

    /** POST /customer/id-verification */
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        if ($user->id_verification_status === 'verified') {
            return redirect('/customer/products');
        }

        $request->validate([
            'valid_id' => ['required', File::types(['jpg', 'jpeg', 'png', 'pdf'])->max(5 * 1024)],
            'selfie'   => ['required', File::types(['jpg', 'jpeg', 'png'])->max(5 * 1024)],
        ], [
            'valid_id.required' => 'Please upload a photo of your valid ID.',
            'selfie.required'   => 'Please provide a selfie photo.',
        ]);

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

        return redirect('/customer/products')
            ->with('success', 'Your identity documents have been submitted. Your account is being reviewed — you can browse products in the meantime.');
    }
}
