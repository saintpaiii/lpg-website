<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\StoreDocumentSubmission;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Support\PrivateDocument;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /documents/{kind}/{id}/{field} — opens a private document (ID, selfie, permit, store document).
 * Allowed: the owner of the record, or a document reviewer (platform admin / permitted platform staff).
 */
class DocumentFileController extends Controller
{
    private const FIELDS = [
        'user'           => ['valid_id', 'valid_id_path', 'selfie_path'],
        'verification'   => ['valid_id_path', 'selfie_path', 'bir_permit_path', 'business_permit_path', 'fsic_permit_path', 'doe_lpg_license_path', 'lto_permit_path'],
        'store'          => ['bir_permit', 'business_permit', 'fsic_permit', 'doe_lpg_license', 'lto_permit'],
        'store-document' => ['file_path'],
    ];

    public function show(Request $request, string $kind, int $id, string $field): StreamedResponse
    {
        abort_unless(in_array($field, self::FIELDS[$kind] ?? [], true), 404);

        // Soft-deleted records stay viewable for reviewers (e.g. a rejected application)
        [$record, $ownerId] = match ($kind) {
            'user'           => [$u = User::withTrashed()->find($id), $u?->id],
            'verification'   => [$v = VerificationRequest::withTrashed()->find($id), $v?->user_id],
            'store'          => [$s = Store::withTrashed()->find($id), $s?->user_id],
            'store-document' => [$d = StoreDocumentSubmission::with(['store' => fn ($q) => $q->withTrashed()])->find($id), $d?->store?->user_id],
        };
        abort_unless($record, 404);

        $user = $request->user();
        abort_unless($user->id === $ownerId || $user->canReviewDocuments(), 403);

        $path = $record->{$field};
        abort_unless($path, 404);

        return PrivateDocument::response($path);
    }
}
