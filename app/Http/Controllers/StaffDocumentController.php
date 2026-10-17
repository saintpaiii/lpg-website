<?php

namespace App\Http\Controllers;

use App\Models\StaffDocument;
use App\Models\Store;
use App\Services\NotificationService;
use App\Services\StaffDocumentService;
use App\Support\PrivateDocument;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * My Documents for store staff and riders (/rider/documents, /seller/my-documents).
 * Riders must upload a driver's license; the store owner reviews everything.
 */
class StaffDocumentController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $this->staff($request);
        $docs = StaffDocument::where('user_id', $user->id)->latest()->get();
        $licenses = $docs->where('doc_type', 'drivers_license');

        return Inertia::render('staff/my-documents', [
            'is_rider'      => $user->isRider(),
            'has_store'     => (bool) $user->store_id,
            'post_url'      => $user->isRider() ? '/rider/documents' : '/seller/my-documents',
            'license'       => $user->isRider() ? [
                'status'  => StaffDocumentService::riderLicenseStatus($user, $licenses),
                'message' => StaffDocumentService::message($user, $licenses),
                'current' => ($l = StaffDocumentService::licenseInfo($user, $licenses)['license']) ? $this->present($l) : null,
            ] : null,
            'documents'     => $docs->map(fn ($d) => $this->present($d))->values(),
            'types'         => collect(StaffDocumentService::TYPES)->except('drivers_license')->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $this->staff($request);
        if (! $user->store_id) {
            return back()->with('error', 'Your account is not linked to a store. Ask your store owner.');
        }

        $isLicense = $request->input('doc_type') === 'drivers_license';
        $data = $request->validate([
            'doc_type'        => ['required', Rule::in(array_keys(StaffDocumentService::TYPES))],
            'label'           => ['required_if:doc_type,other', 'nullable', 'string', 'max:100'],
            'document_number' => [$isLicense ? 'required' : 'nullable', 'string', 'max:50'],
            'file'            => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'expires_at'      => [$isLicense ? 'required' : 'nullable', 'date', 'after:today'],
        ], [
            'label.required_if'        => 'Please enter the name of the document.',
            'document_number.required' => 'Please enter your license number.',
            'expires_at.required'      => 'Please enter the date your license is valid until.',
            'expires_at.after'         => 'The document must still be valid (date after today).',
            'file.max'                 => 'The file must be 5 MB or smaller.',
        ]);

        $type  = $data['doc_type'];
        $label = $type === 'other' ? trim((string) $data['label']) : null;
        $same  = fn () => StaffDocument::where('user_id', $user->id)->where('doc_type', $type)
            ->when($type === 'other', fn ($q) => $q->where('label', $label));

        if ($same()->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['file' => 'This document is already waiting for review.']);
        }
        if ($same()->where('status', 'rejected')->where('reviewed_at', '>=', now()->subDays(30))->count() >= StaffDocumentService::MAX_REJECTIONS) {
            throw ValidationException::withMessages(['file' => "You've reached 5 attempts. Please talk to your store owner."]);
        }

        StaffDocument::create([
            'user_id'         => $user->id,
            'store_id'        => $user->store_id,
            'doc_type'        => $type,
            'label'           => $label,
            'document_number' => $data['document_number'] ?? null,
            'file_path'       => $request->file('file')->store('staff_documents', 'local'),
            'expires_at'      => $data['expires_at'] ?? null,
            'status'          => 'pending',
        ]);

        $name = StaffDocumentService::label($type, $label);
        if ($ownerId = Store::whereKey($user->store_id)->value('user_id')) {
            NotificationService::send($ownerId, 'system', 'Staff document to review', "{$user->name} uploaded {$name} for your review.",
                ['link' => "/seller/staff/{$user->id}"]);
        }

        return back()->with('success', "{$name} uploaded. Your store owner will review it.");
    }

    private function present(StaffDocument $d): array
    {
        return [
            'id'              => $d->id,
            'doc_type'        => $d->doc_type,
            'label'           => StaffDocumentService::label($d->doc_type, $d->label),
            'document_number' => $d->document_number,
            'expires_on'      => $d->expires_at?->format('M j, Y'),
            'status'          => $d->status,
            'reason'          => $d->rejection_reason,
            'date'            => $d->created_at->timezone('Asia/Manila')->format('M j, Y'),
            'url'             => PrivateDocument::url('staff-document', $d->id, 'file_path'),
        ];
    }

    /** Riders and store staff only (the 'seller' middleware also lets the owner in). */
    private function staff(Request $request)
    {
        $user = $request->user();
        abort_unless($user->role === 'seller_staff' || $user->isRider(), 403);

        return $user;
    }
}
