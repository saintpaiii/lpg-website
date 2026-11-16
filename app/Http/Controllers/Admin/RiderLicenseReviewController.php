<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StaffDocument;
use App\Services\StaffDocumentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Admin → Verifications → "Rider license": a rider's driver's license whose live selfie did not match automatically
 * (or couldn't be checked) is approved / rejected here. An approved license can also be revoked.
 * The store owner no longer approves licenses (they only monitor them). Route middleware: permission:verifications.view.
 */
class RiderLicenseReviewController extends Controller
{
    public function approve(Request $request, StaffDocument $document): RedirectResponse
    {
        abort_unless($document->doc_type === 'drivers_license', 404);
        if ($document->status !== 'pending') {
            return back()->with('error', 'This license was already decided.');
        }

        $data = $request->validate([
            'expires_at' => ['nullable', 'date', 'after:today'],
        ], ['expires_at.after' => 'The license must still be valid (date after today).']);

        if (! ($data['expires_at'] ?? null) && (! $document->expires_at || $document->expires_at->lt(StaffDocumentService::today()))) {
            return back()->with('error', 'This license has no valid expiry date — enter the "valid until" date.');
        }

        StaffDocumentService::approveLicense($document->loadMissing(['user', 'store']), $request->user(), $data['expires_at'] ?? null);

        return back()->with('success', "{$document->user?->name}'s driver's license approved.");
    }

    public function reject(Request $request, StaffDocument $document): RedirectResponse
    {
        abort_unless($document->doc_type === 'drivers_license', 404);
        if (! in_array($document->status, ['pending', 'approved'], true)) {
            return back()->with('error', 'This license was already rejected.');
        }

        $data = $request->validate(['reason' => ['required', 'string', 'max:500']], ['reason.required' => 'Please give a reason.']);
        $revoke = $document->status === 'approved';

        StaffDocumentService::rejectLicense($document->loadMissing(['user', 'store']), $request->user(), $data['reason']);

        return back()->with('success', "{$document->user?->name}'s driver's license " . ($revoke ? 'revoked.' : 'rejected.'));
    }
}
