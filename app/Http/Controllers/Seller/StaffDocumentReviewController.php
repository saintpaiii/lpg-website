<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\StaffDocument;
use App\Models\Store;
use App\Services\NotificationService;
use App\Services\StaffDocumentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** The store owner approves or rejects documents uploaded by their staff and riders. */
class StaffDocumentReviewController extends Controller
{
    public function approve(Request $request, StaffDocument $document): RedirectResponse
    {
        $this->ownStore($request, $document);
        if ($document->status !== 'pending') {
            return back()->with('error', 'This document was already reviewed.');
        }

        $data = $request->validate([
            'expires_at' => [$document->doc_type === 'drivers_license' ? 'required' : 'nullable', 'date', 'after:today'],
        ], ['expires_at.required' => 'Please enter the date the license is valid until.']);

        $document->update([
            'status'      => 'approved',
            'expires_at'  => $data['expires_at'] ?? $document->expires_at,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ]);

        $name = StaffDocumentService::label($document->doc_type, $document->label);
        NotificationService::send($document->user_id, 'system', 'Document approved', "Your {$name} was approved.",
            ['link' => $this->documentsLink($document)]);

        return back()->with('success', "{$name} approved.");
    }

    public function reject(Request $request, StaffDocument $document): RedirectResponse
    {
        $this->ownStore($request, $document);
        if ($document->status !== 'pending') {
            return back()->with('error', 'This document was already reviewed.');
        }

        $data = $request->validate(['reason' => ['required', 'string', 'max:500']], ['reason.required' => 'Please give a reason.']);

        $document->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['reason'],
            'reviewed_by'      => $request->user()->id,
            'reviewed_at'      => now(),
        ]);

        $name = StaffDocumentService::label($document->doc_type, $document->label);
        NotificationService::send($document->user_id, 'system', 'Document rejected', "Your {$name} was rejected: {$data['reason']}",
            ['link' => $this->documentsLink($document)]);

        return back()->with('success', "{$name} rejected.");
    }

    private function ownStore(Request $request, StaffDocument $document): void
    {
        $storeId = $request->attributes->get('seller_store')?->id ?? Store::where('user_id', $request->user()->id)->value('id');
        abort_unless($storeId && (int) $document->store_id === (int) $storeId, 403);
    }

    private function documentsLink(StaffDocument $document): string
    {
        return $document->user?->isRider() ? '/rider/documents' : '/seller/my-documents';
    }
}
