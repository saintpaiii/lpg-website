<?php

namespace App\Services;

use App\Http\Controllers\Admin\DocumentOcrController;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Models\VerificationRequest;
use App\Support\PrivateDocument;
use App\Support\StoreDocuments;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * J3 — reviewing a store application on ONE page: every document gets Accept / Reject (stores.document_reviews,
 * saved as each decision is made), plus "address matches the pin" and "duplicates checked".
 *  - The owner's valid ID counts as accepted automatically when the J2 face match passed and the ID name check didn't
 *    flag a mismatch (the admin can still reject it).
 *  - "Duplicate warnings checked" counts as accepted automatically when there are no duplicate warnings.
 *  - Approve needs every required document + the 2 items accepted; extra ("other") documents must be decided.
 *  - Send back (any rejection) lists each rejected document with its reason for the seller.
 */
class StoreReviewService
{
    /** The latest seller application of the store's owner (documents fall back to it). */
    public static function application(Store $store): ?VerificationRequest
    {
        return VerificationRequest::withTrashed()->where('user_id', $store->user_id)
            ->where('type', 'seller_application')->latest('id')->first();
    }

    /** Extra documents sent with the application (or added while it's under review). */
    public static function otherDocuments(Store $store): Collection
    {
        return StoreDocumentSubmission::where('store_id', $store->id)->where('doc_type', 'other')->oldest('id')->get();
    }

    /**
     * Everything to review, in order: [key, label, url, is_pdf, needs_date, expiry_column, required, submission_id].
     * Required documents without a file (e.g. DTI on very old stores) are skipped.
     */
    public static function documents(Store $store, ?VerificationRequest $app = null): array
    {
        $app ??= static::application($store);
        $out = [];

        foreach (StoreDocuments::REVIEW_DOCS as $key) {
            [$path] = DocumentOcrController::requiredDocument($store, $key);
            if (! $path) {
                continue;
            }
            $url = match (true) {
                $key === 'valid_id' && $app?->valid_id_path => PrivateDocument::url('verification', $app->id, 'valid_id_path'),
                $key === 'valid_id' && $store->owner?->valid_id_path => PrivateDocument::url('user', (int) $store->user_id, 'valid_id_path'),
                $key === 'valid_id' => PrivateDocument::urlIf($store->owner?->valid_id, 'user', (int) $store->user_id, 'valid_id'),
                (bool) $store->{$key} => PrivateDocument::url('store', $store->id, $key),
                default => PrivateDocument::urlIf($app?->{"{$key}_path"}, 'verification', (int) $app?->id, "{$key}_path"),
            };
            $col = $key === 'valid_id' ? null : StoreDocuments::expiryColumnFor($store, $key);
            // J9: a branch reuses the main store's ID / BIR / DTI-SEC — shown read-only as "From main store — already accepted"
            $inherited = $store->isBranch() && in_array($key, \App\Services\BranchService::INHERITED_DOCS, true);
            $out[] = [
                'inherited'     => $inherited,
                'key'           => $key,
                'label'         => StoreDocuments::reviewLabel($key, $store->dti_sec_kind),
                'url'           => $url,
                'is_pdf'        => str_ends_with(strtolower($path), '.pdf'),
                'needs_date'    => $col !== null,
                'expiry_column' => $col,
                'current_expires' => $col && $store->{$col} ? $store->{$col}->toDateString() : null,
                'required'      => true,
                'submission_id' => null,
            ];
        }

        foreach (static::otherDocuments($store) as $d) {
            $out[] = [
                'key'           => 'other-' . $d->id,
                'label'         => ($d->label ?: 'Other document') . ' (extra)',
                'url'           => PrivateDocument::url('store-document', $d->id, 'file_path'),
                'is_pdf'        => str_ends_with(strtolower((string) $d->file_path), '.pdf'),
                'needs_date'    => false,
                'expiry_column' => null,
                'current_expires' => null,
                'required'      => false,
                'submission_id' => $d->id,
            ];
        }

        return $out;
    }

    /**
     * The decision for each key (documents + the 2 items): saved decision, else automatic, else null (not reviewed).
     * @return array<string, array{status: ?string, reason: ?string, note: ?string, by_name: ?string, at: ?string, expires_at: ?string, auto: ?string}>
     */
    public static function decisions(Store $store, array $documents, ?VerificationRequest $app = null): array
    {
        $app   ??= static::application($store);
        $saved = (array) ($store->document_reviews ?? []);
        $out   = [];

        foreach ([...array_column($documents, 'key'), ...StoreDocuments::REVIEW_ITEMS] as $key) {
            $r = $saved[$key] ?? null;
            $auto = null;
            if (! $r && $key === 'valid_id' && $app?->face_match_status === 'passed'
                && (($store->document_ocr['valid_id']['name_match'] ?? null) !== false)) {
                $auto = 'Accepted automatically — face match ' . FaceMatchService::pct((float) $app->face_match_score);
            }
            if (! $r && $key === 'duplicates' && empty($store->duplicate_flags['matches'] ?? [])) {
                $auto = 'No duplicate warnings — accepted automatically';
            }
            $out[$key] = [
                'status'     => $r['status'] ?? ($auto ? 'accepted' : null),
                'reason'     => $r['reason'] ?? null,
                'note'       => $r['note'] ?? null,
                'by_name'    => $r['by_name'] ?? null,
                'at'         => isset($r['at']) ? Carbon::parse($r['at'])->timezone('Asia/Manila')->format('M j, Y g:i A') : null,
                'expires_at' => $r['expires_at'] ?? null,
                'auto'       => $r ? null : $auto,
            ];
        }

        return $out;
    }

    /** null when the store can be approved, else why not (plain English). */
    public static function approveBlocker(array $documents, array $decisions, ?Store $store = null): ?string
    {
        if ($store && ! $store->owner?->hasVerifiedEmail()) {
            return "Owner hasn't verified their email yet — the store can be approved after they enter the email code.";
        }
        foreach ($documents as $d) {
            $status = $decisions[$d['key']]['status'] ?? null;
            if ($d['required'] && $status !== 'accepted') {
                return "Accept every document first ({$d['label']} is " . ($status === 'rejected' ? 'rejected' : 'not reviewed') . ').';
            }
            if (! $d['required'] && $status === null) {
                return "Accept or reject the extra document \"{$d['label']}\" first.";
            }
        }
        foreach (StoreDocuments::REVIEW_ITEMS as $key) {
            if (($decisions[$key]['status'] ?? null) !== 'accepted') {
                return 'Accept "' . StoreDocuments::reviewLabel($key) . '" first.';
            }
        }

        return null;
    }

    /** "FSIC — Expired (note)" for each rejected document / item. */
    public static function rejectedLines(array $documents, array $decisions): array
    {
        $labels = array_column($documents, 'label', 'key') + collect(StoreDocuments::REVIEW_ITEMS)->mapWithKeys(fn ($k) => [$k => StoreDocuments::reviewLabel($k)])->all();
        $lines = [];
        foreach ($decisions as $key => $d) {
            if (($d['status'] ?? null) === 'rejected') {
                $lines[] = [
                    'key'    => $key,
                    'label'  => $labels[$key] ?? $key,
                    'reason' => $d['reason'],
                    'note'   => $d['note'],
                    'text'   => ($labels[$key] ?? $key) . ' — ' . $d['reason'] . ($d['note'] ? " ({$d['note']})" : ''),
                ];
            }
        }

        return $lines;
    }

    /**
     * The seller re-uploaded these documents: their decisions go back to "Not reviewed" (others keep theirs).
     * $addressChanged: the address / pin was edited → that item is reviewed again too.
     */
    public static function resetReviews(Store $store, array $keys, bool $addressChanged = false): void
    {
        $saved = (array) ($store->document_reviews ?? []);
        foreach ($keys as $k) {
            unset($saved[$k]);
        }
        if ($addressChanged) {
            unset($saved['address_pin']);
        }
        $store->forceFill(['document_reviews' => $saved ?: null])->save();
    }

    /** Rejected documents of a store sent back to the seller (for the seller's pages). */
    public static function rejectedForSeller(Store $store): array
    {
        if ($store->status !== 'rejected') {
            return [];
        }
        $documents = static::documents($store);

        return static::rejectedLines($documents, static::decisions($store, $documents));
    }
}
