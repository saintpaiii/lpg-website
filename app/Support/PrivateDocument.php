<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * IDs, selfies, permits and store documents are private: stored on the 'local' disk and only served through
 * DocumentFileController (owner or document reviewers). Files uploaded before this change may still be on
 * 'public' until `php artisan documents:make-private` moves them.
 */
class PrivateDocument
{
    public static function response(string $path): StreamedResponse
    {
        foreach (['local', 'public'] as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return Storage::disk($disk)->response($path, null, ['Cache-Control' => 'private, no-store']);
            }
        }
        abort(404);
    }

    /** Link that opens the file in the browser (checked on every request). */
    public static function url(string $kind, int $id, string $field): string
    {
        return route('documents.show', ['kind' => $kind, 'id' => $id, 'field' => $field]);
    }

    /** url() when the path is set, else null. */
    public static function urlIf(?string $path, string $kind, int $id, string $field): ?string
    {
        return $path ? static::url($kind, $id, $field) : null;
    }
}
