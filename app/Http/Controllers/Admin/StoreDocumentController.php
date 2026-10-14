<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Services\NotificationService;
use App\Services\StoreDocumentService;
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
            ->map(function ($d) {
                $isPermit = $d->doc_type !== 'other';

                return [
                    'id'              => $d->id,
                    'store_id'        => $d->store_id,
                    'store_name'      => $d->store?->store_name,
                    'doc_type'        => $d->doc_type,
                    'label'           => $isPermit ? StoreDocuments::label($d->doc_type) : ($d->label ?? 'Other document'),
                    'is_other'        => ! $isPermit,
                    'has_expiry'      => $isPermit ? StoreDocuments::expiryColumn($d->doc_type) !== null : true,
                    'current_expires' => $isPermit && $d->store ? StoreDocuments::expiry($d->store, $d->doc_type)?->format('M d, Y') : null,
                    'new_expires'     => $d->expires_at?->toDateString(),
                    'new_expires_on'  => $d->expires_at?->format('M d, Y'),
                    'submitted_on'    => $d->created_at->timezone('Asia/Manila')->format('M d, Y g:i A'),
                    'submitted_by'    => $d->submitter?->name,
                    'url'             => PrivateDocument::url('store-document', $d->id, 'file_path'),
                ];
            })->values();

        return Inertia::render('admin/store-documents', [
            'tab'      => $tab,
            'pending'  => $pending,
            'expiring' => $rows['expiring'],
            'expired'  => $rows['expired'],
            'missing'  => $rows['missing'],
            'counts'   => ['pending' => $pending->count(), 'expiring' => count($rows['expiring']), 'expired' => count($rows['expired']), 'missing' => count($rows['missing'])],
            'max_date' => StoreDocuments::today()->addYears(5)->toDateString(),
        ]);
    }

    public function approve(Request $request, StoreDocumentSubmission $submission): RedirectResponse
    {
        $this->allowed($request);
        abort_unless($submission->status === 'pending', 422, 'This document was already reviewed.');

        $column = $submission->doc_type !== 'other' ? StoreDocuments::expiryColumn($submission->doc_type) : null;
        $data = $request->validate([
            'expires_at' => [$column ? 'required' : 'nullable', 'date', 'after:today', 'before_or_equal:' . StoreDocuments::today()->addYears(5)->toDateString()],
        ], ['expires_at.required' => 'Please enter the date the document is valid until.']);

        DB::transaction(function () use ($submission, $data, $column, $request) {
            $submission->update([
                'status'      => 'approved',
                'expires_at'  => $data['expires_at'] ?? $submission->expires_at,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
            ]);

            if ($submission->doc_type !== 'other') {
                // The renewed file and date become the store's current permit (old files are kept)
                $updates = [$submission->doc_type => $submission->file_path];
                if ($column) {
                    $updates[$column] = $submission->expires_at;
                }
                $submission->store->update($updates);
            }
        });

        $store = $submission->store->fresh();
        StoreDocumentService::checkStore($store);   // lifts the hiding at once when nothing is expired any more

        $name = $this->name($submission);
        NotificationService::send($store->user_id, 'system', 'Document approved', "Your {$name} was approved.", ['link' => '/seller/documents']);

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
        NotificationService::send($submission->store->user_id, 'system', 'Document rejected',
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
