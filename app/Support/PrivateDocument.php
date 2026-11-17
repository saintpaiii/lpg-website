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

    /**
     * Move one file from the public disk (web-accessible under /storage/…) to the private 'local' disk, keeping its path.
     * Returns true when the file is private afterwards. Used for files uploaded before they became private.
     */
    public static function moveToPrivate(string $path): bool
    {
        $public = Storage::disk('public');
        $local  = Storage::disk('local');
        if (! $public->exists($path)) {
            return $local->exists($path);
        }
        if (! $local->exists($path)) {
            $local->put($path, $public->get($path));
        }
        if ($local->exists($path) && $local->size($path) === $public->size($path)) {
            $public->delete($path);

            return true;
        }

        return false;
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
