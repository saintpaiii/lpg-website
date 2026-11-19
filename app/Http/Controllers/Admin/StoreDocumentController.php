<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Services\NotificationService;
use App\Services\StoreDocumentService;
use App\Services\DuplicateStoreService;
use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Review renewed permits and extra documents; overview of expiring / expired / missing permit dates.
 * Platform admins and platform staff with verifications or stores permission.
 */
class StoreDocumentController extends Controller
{
    private const TABS = ['pending', 'expiring', 'expired', 'missing'];

    public function index(Request $request): Response
    {
        $this->allowed($request);
        $tab = in_array($request->query('tab'), self::TABS, true) ? $request->query('tab') : 'pending';

        // Approved stores with their permit dates (small table — classified in PHP)
        $stores = Store::where('status', 'approved')->orderBy('store_name')->get();
        $rows   = ['expiring' => [], 'expired' => [], 'missing' => []];
        foreach ($stores as $s) {
            foreach (StoreDocuments::expiringTypes() as $t) {
                $sum = StoreDocuments::summary($s, $t) + ['store_id' => $s->id, 'store_name' => $s->store_name, 'documents_suspended' => (bool) $s->documents_suspended];
                match ($sum['status']) {
                    'expiring' => $rows['expiring'][] = $sum,
                    'expired'  => $rows['expired'][]  = $sum,
                    'no_date'  => $rows['missing'][]  = $sum,
                    default    => null,
                };
            }
        }
        usort($rows['expiring'], fn ($a, $b) => $a['days_left'] <=> $b['days_left']);
        usort($rows['expired'], fn ($a, $b) => $a['days_left'] <=> $b['days_left']);

        $pending = StoreDocumentSubmission::with(['store', 'submitter:id,name'])->where('status', 'pending')->oldest()->get()
            ->map(function ($d) use ($request) {
                $isPermit = $d->doc_type !== 'other';

                return [
                    'id'              => $d->id,
                    'seen'            => \App\Services\SectionVisitService::flagsFor($request, $d),
                    'store_id'        => $d->store_id,
                    'store_name'      => $d->store?->store_name,
                    'doc_type'        => $d->doc_type,
                    'label'           => $d->doc_type === 'dti_sec_registration' ? StoreDocuments::dtiSecLabel($d->dti_sec_kind)
                        : ($isPermit ? StoreDocuments::label($d->doc_type) : ($d->label ?? 'Other document')),
                    'is_other'        => ! $isPermit,
                    // Only the 4 documents that expire ask for a date (DTI only when it is a DTI certificate); extras never
                    'has_expiry'      => $isPermit && StoreDocuments::expiryColumn($d->doc_type, $d->dti_sec_kind ?? $d->store?->dti_sec_kind) !== null,
                    'is_pdf'          => str_ends_with(strtolower((string) $d->file_path), '.pdf'),
                    'max_date'        => StoreDocuments::maxValidUntil($d->doc_type),
                    'current_expires' => $isPermit && $d->store ? StoreDocuments::expiry($d->store, $d->doc_type)?->format('M d, Y') : null,
                    'new_expires'     => $d->expires_at?->toDateString(),
                    'new_expires_on'  => $d->expires_at?->format('M d, Y'),
                    'submitted_on'    => $d->created_at->timezone('Asia/Manila')->format('M d, Y g:i A'),
                    'submitted_by'    => $d->submitter?->name,
                    'url'             => PrivateDocument::url('store-document', $d->id, 'file_path'),
                    // Auto-read (OCR) — read one by one by the page when null
                    'ocr_key'         => 'sub-' . $d->id,
                    'ocr'             => DocumentOcrController::present($d->ocr),
                ];
            })->values();

        return Inertia::render('admin/store-documents', [
            'since'    => \App\Services\SectionVisitService::sinceIso($request),
            'tab'      => $tab,
            'pending'  => $pending,
            'expiring' => $rows['expiring'],
            'expired'  => $rows['expired'],
            'missing'  => $rows['missing'],
            'counts'   => ['pending' => $pending->count(), 'expiring' => count($rows['expiring']), 'expired' => count($rows['expired']), 'missing' => count($rows['missing'])],
            'max_date' => StoreDocuments::today()->addYears(5)->toDateString(),
            'ocr_enabled' => \App\Services\DocumentOcrService::enabled(),
            // Same Reject reasons as the store application review (J3)
            'reject_reasons' => StoreDocuments::REJECT_REASONS,
        ]);
    }

    public function approve(Request $request, StoreDocumentSubmission $submission): RedirectResponse
    {
        $this->allowed($request);
        abort_unless($submission->status === 'pending', 422, 'This document was already reviewed.');

        // The admin confirms the "valid until" printed on the document (pre-filled by OCR; the seller no longer types it)
        $column = $submission->doc_type !== 'other'
            ? StoreDocuments::expiryColumn($submission->doc_type, $submission->dti_sec_kind ?? $submission->store?->dti_sec_kind)
            : null;
        $data = $request->validate([
            'expires_at' => $column ? StoreDocuments::validUntilRule(true, $submission->doc_type) : ['nullable'],
        ], StoreDocuments::validUntilMessages('expires_at', $submission->doc_type));

        DB::transaction(function () use ($submission, $data, $column, $request) {
            $submission->update([
                'status'      => 'approved',
                'expires_at'  => $column ? $data['expires_at'] : null,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

            if ($submission->doc_type !== 'other') {
                // The renewed file and date become the store's current permit (old files are kept)
                $updates = [$submission->doc_type => $submission->file_path];
                if ($submission->doc_type === 'dti_sec_registration' && $submission->dti_sec_kind) {
                    $updates['dti_sec_kind'] = $submission->dti_sec_kind;
                }
                if ($column) {
                    $updates[$column] = $data['expires_at'];
                }
                // SEC now → no DTI date
                if ($submission->doc_type === 'dti_sec_registration' && ! $column) {
                    $updates['dti_sec_expires_at'] = null;
                }
                // Its auto-read result and file hash (duplicate check) now describe the store's current permit
                $store  = Store::whereKey($submission->store_id)->lockForUpdate()->first();
                $ocr    = (array) ($store->document_ocr ?? []);
                $hashes = (array) ($store->document_hashes ?? []);
                if ($submission->ocr) {
                    $ocr[$submission->doc_type] = $submission->ocr;
                } else {
                    unset($ocr[$submission->doc_type]);
                }
                if ($h = DuplicateStoreService::hashStored($submission->file_path)) {
                    $hashes[$submission->doc_type] = $h;
                }
                $updates['document_ocr']    = $ocr ?: null;
                $updates['document_hashes'] = $hashes ?: null;
                $store->update($updates);
            }
        });

        $store = $submission->store->fresh();
        StoreDocumentService::checkStore($store);   // lifts the hiding at once when nothing is expired any more

        $name = $this->name($submission);
        NotificationService::sendToStoreOwner($store, 'system', 'Document approved', "Your {$name} was approved.", ['link' => '/seller/documents']);

        return back()->with('success', "{$name} approved for {$store->store_name}.");
    }

    public function reject(Request $request, StoreDocumentSubmission $submission): RedirectResponse
    {
        $this->allowed($request);
        abort_unless($submission->status === 'pending', 422, 'This document was already reviewed.');

        $data = $request->validate(['reason' => ['required', 'string', 'max:500']], ['reason.required' => 'Please give a reason.']);

        $submission->update([
            'status'           => 'rejected',
            'rejection_reason' => $data['reason'],
            'reviewed_by'      => $request->user()->id,
            'reviewed_at'      => now(),
        ]);

        $name = $this->name($submission);
        NotificationService::sendToStoreOwner($submission->store, 'system', 'Document rejected',
            "Your {$name} was rejected: {$data['reason']}", ['link' => '/seller/documents']);

        return back()->with('success', "{$name} rejected.");
    }

    private function name(StoreDocumentSubmission $s): string
    {
        return $s->doc_type === 'other' ? ($s->label ?? 'document') : StoreDocuments::label($s->doc_type);
    }

    private function allowed(Request $request): void
    {
        abort_unless($request->user()?->canReviewDocuments(), 403);
    }
}
