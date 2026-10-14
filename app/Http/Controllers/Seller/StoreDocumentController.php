<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Services\StoreDocumentService;
use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store Documents (store owner): see each permit's expiry, upload renewed permits and extra documents
 * for admin review.
 */
class StoreDocumentController extends Controller
{
    /** Max approved "other" documents per store. */
    private const MAX_OTHER = 10;

    public function index(Request $request): Response
    {
        $store = $this->ownStore($request);
        $subs  = $store->documentSubmissions()->latest()->get();

        $permits = collect(array_keys(StoreDocuments::TYPES))->map(function ($type) use ($store, $subs) {
            $mine   = $subs->where('doc_type', $type);
            $latest = $mine->first();

            return StoreDocuments::summary($store, $type) + [
                'file_url'        => $store->{$type} ? PrivateDocument::url('store', $store->id, $type) : null,
                'has_expiry'      => StoreDocuments::expiryColumn($type) !== null,
                'pending'         => (bool) $mine->firstWhere('status', 'pending'),
                'pending_expires' => $mine->firstWhere('status', 'pending')?->expires_at?->format('M d, Y'),
                'rejected_reason' => $latest?->status === 'rejected' ? $latest->rejection_reason : null,
            ];
        })->values();

        $others = $subs->where('doc_type', 'other')->map(fn ($d) => [
            'id'         => $d->id,
            'label'      => $d->label,
            'status'     => $d->status,
            'expires_on' => $d->expires_at?->format('M d, Y'),
            'reason'     => $d->rejection_reason,
            'date'       => $d->created_at->timezone('Asia/Manila')->format('M d, Y'),
            'url'        => PrivateDocument::url('store-document', $d->id, 'file_path'),
        ])->values();

        return Inertia::render('seller/documents', [
            'permits'             => $permits,
            'others'              => $others,
            'documents_suspended' => (bool) $store->documents_suspended,
            'max_other'           => self::MAX_OTHER,
            'max_date'            => StoreDocuments::today()->addYears(5)->toDateString(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $store = $this->ownStore($request);
        $types = array_keys(StoreDocuments::TYPES);

        $data = $request->validate([
            'doc_type'   => ['required', Rule::in([...$types, 'other'])],
            'label'      => ['required_if:doc_type,other', 'nullable', 'string', 'max:100'],
            'file'       => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'expires_at' => [
                Rule::requiredIf(fn () => StoreDocuments::expiryColumn((string) $request->input('doc_type')) !== null),
                'nullable', 'date', 'after:today', 'before_or_equal:' . StoreDocuments::today()->addYears(5)->toDateString(),
            ],
        ], [
            'label.required_if'   => 'Please enter the name of the document (e.g. DTI Registration).',
            'expires_at.required' => 'Please enter the date this document is valid until.',
            'expires_at.after'    => 'The document must still be valid (date after today).',
            'file.max'            => 'The file must be 5 MB or smaller.',
        ]);

        $type  = $data['doc_type'];
        $label = $type === 'other' ? trim($data['label']) : null;
        $same  = fn () => StoreDocumentSubmission::where('store_id', $store->id)->where('doc_type', $type)
            ->when($type === 'other', fn ($q) => $q->where('label', $label));

        if ($same()->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['file' => 'This document is already waiting for review.']);
        }
        $rejected = $same()->where('status', 'rejected')->where('reviewed_at', '>=', now()->subDays(30))->count();
        if ($rejected >= StoreDocuments::MAX_REJECTIONS) {
            throw ValidationException::withMessages(['file' => "You've reached 5 attempts for this document in 30 days. Please contact the platform admin through Reports."]);
        }
        if ($type === 'other' && StoreDocumentSubmission::where('store_id', $store->id)->where('doc_type', 'other')->where('status', 'approved')->count() >= self::MAX_OTHER) {
            throw ValidationException::withMessages(['file' => 'You already have ' . self::MAX_OTHER . ' approved extra documents.']);
        }

        StoreDocumentSubmission::create([
            'store_id'     => $store->id,
            'doc_type'     => $type,
            'label'        => $label,
            'file_path'    => $request->file('file')->store('store_documents', 'local'),
            'expires_at'   => $data['expires_at'] ?? null,
            'status'       => 'pending',
            'submitted_by' => $request->user()->id,
        ]);

        $name = $label ?? StoreDocuments::label($type);
        StoreDocumentService::notifyAdmins('Store document to review', "{$store->store_name} uploaded {$name} for review.",
            ['link' => '/admin/store-documents', 'store_id' => $store->id]);

        return back()->with('success', "{$name} uploaded. The platform admin will review it.");
    }

    private function ownStore(Request $request): Store
    {
        return $request->attributes->get('seller_store') ?? Store::where('user_id', $request->user()->id)->firstOrFail();
    }
}
