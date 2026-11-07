<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Models\VerificationRequest;
use App\Services\DocumentOcrCheck;
use App\Services\DocumentOcrService;
use App\Support\StoreDocuments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * "Auto-read": reads ONE seller document with OCR.space and saves the result, so the next visit is instant.
 * The admin page calls this one document at a time (no queue worker needed). Warnings only — never decides.
 */
class DocumentOcrController extends Controller
{
    /** POST admin/stores/{store}/documents/{key}/ocr — key: a doc type, 'valid_id' or 'sub-{submissionId}' */
    public function read(Request $request, Store $store, string $key): JsonResponse
    {
        abort_unless($request->user()?->canReviewDocuments(), 403);

        if (str_starts_with($key, 'sub-')) {
            $sub = StoreDocumentSubmission::where('store_id', $store->id)->findOrFail((int) substr($key, 4));
            $type   = $sub->doc_type;
            $result = static::readFile($store, $sub->file_path, $type, $sub->expires_at?->toDateString());
            $sub->forceFill(['ocr' => $result])->save();

            return response()->json(['key' => $key, 'ocr' => static::present($result)]);
        }

        abort_unless($key === 'valid_id' || array_key_exists($key, StoreDocuments::TYPES), 404);

        [$path, $typed] = static::requiredDocument($store, $key);
        $result = static::readFile($store, $path, $key, $typed);

        // Save under its key without overwriting results written meanwhile for other documents
        \Illuminate\Support\Facades\DB::transaction(function () use ($store, $key, $result) {
            $row = Store::whereKey($store->id)->lockForUpdate()->first();
            $all = (array) ($row->document_ocr ?? []);
            $all[$key] = $result;
            $row->forceFill(['document_ocr' => $all])->save();
        });

        return response()->json(['key' => $key, 'ocr' => static::present($result)]);
    }

    /** Local path + typed expiry of a required document (the store's own file, else the application's). */
    public static function requiredDocument(Store $store, string $key): array
    {
        $application = VerificationRequest::withTrashed()->where('user_id', $store->user_id)
            ->where('type', 'seller_application')->latest()->first();

        if ($key === 'valid_id') {
            return [$application?->valid_id_path ?? $store->owner?->valid_id, null];
        }

        $col = StoreDocuments::expiryColumn($key);

        return [$store->{$key} ?: $application?->{"{$key}_path"}, $col ? $store->{$col}?->toDateString() : null];
    }

    private static function readFile(Store $store, ?string $path, string $type, ?string $typedExpiry): array
    {
        if (! $path || ! Storage::disk('local')->exists($path)) {
            return DocumentOcrCheck::unavailable('missing');
        }

        $text = DocumentOcrService::read(Storage::disk('local')->path($path));
        if ($text === null) {
            return DocumentOcrCheck::unavailable(DocumentOcrService::$lastProblem ?? 'error');
        }

        return DocumentOcrCheck::analyze($store->loadMissing('owner'), $type, $text, $typedExpiry);
    }

    /** What the admin page shows for one document (null = not read yet). */
    public static function present(?array $r): ?array
    {
        if (! $r) {
            return null;
        }

        return [
            'read_at'       => isset($r['read_at']) ? \Illuminate\Support\Carbon::parse($r['read_at'])->timezone('Asia/Manila')->format('M j, Y g:i A') : null,
            'unavailable'   => $r['unavailable'] ?? null,
            'warnings'      => array_values($r['warnings'] ?? []),
            'text'          => (string) ($r['text'] ?? ''),
            'likely_expiry' => ! empty($r['likely_expiry']) ? \Illuminate\Support\Carbon::parse($r['likely_expiry'])->format('M j, Y') : null,
            'found_tin'     => $r['found_tin'] ?? null,
            'name_match'    => $r['name_match'] ?? null,
        ];
    }
}
