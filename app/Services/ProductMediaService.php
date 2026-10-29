<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductMedia;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Product photos (max 8) + one short video, saved from the seller's product form.
 *
 * The form sends the final order as tokens: "id:{mediaId}" for kept items and "new:{i}" for new_files[i]
 * (with new_posters[i] for videos and new_meta[i] = JSON {width,height,duration}). Items not in the list are removed.
 * products.image is kept as the cover (first photo) so every other page keeps working unchanged.
 */
class ProductMediaService
{
    public const MAX_IMAGES = 8;
    public const MAX_VIDEOS = 1;

    private const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    private const VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm'];

    /** Validation rules for the media part of the product form. */
    public static function rules(): array
    {
        return [
            'media_order'    => ['nullable', 'array', 'max:' . (self::MAX_IMAGES + self::MAX_VIDEOS)],
            'media_order.*'  => ['distinct', 'string', 'regex:/^(id|new):\d+$/'],
            'new_files'      => ['nullable', 'array'],
            'new_files.*'    => ['required', 'file', 'mimetypes:' . implode(',', [...self::IMAGE_TYPES, ...self::VIDEO_TYPES]),
                function (string $attribute, mixed $file, Closure $fail) {
                    if (! $file instanceof UploadedFile) {
                        return;
                    }
                    $isVideo = str_starts_with((string) $file->getMimeType(), 'video/');
                    $maxKb   = $isVideo ? 20480 : 5120;
                    if ($file->getSize() > $maxKb * 1024) {
                        $fail($isVideo ? 'Videos can be up to 20 MB.' : 'Photos can be up to 5 MB.');
                    }
                }],
            'new_posters'    => ['nullable', 'array'],
            'new_posters.*'  => ['nullable', 'image', 'max:2048'],
            'new_meta'       => ['nullable', 'array'],
            'new_meta.*'     => ['nullable', 'string', 'max:200'],
        ];
    }

    public static function messages(): array
    {
        return [
            'new_files.*.mimetypes' => 'Photos must be JPG, PNG or WebP; the video must be MP4, MOV or WebM.',
            'media_order.max'       => 'Up to 8 photos and 1 video.',
        ];
    }

    /** Apply the submitted order / new files to the product (inside one transaction; removed files are deleted after commit). */
    public static function sync(Product $product, Request $request): void
    {
        $tokens   = array_values((array) $request->input('media_order', []));   // empty = remove all media
        $newFiles = (array) $request->file('new_files', []);
        $posters  = (array) $request->file('new_posters', []);
        $meta     = (array) $request->input('new_meta', []);
        $existing = $product->exists ? $product->media()->get()->keyBy('id') : collect();

        // ── Cross-field checks ────────────────────────────────────────────────
        $newIndexes = [];
        $images = $videos = 0;
        foreach ($tokens as $token) {
            [$kind, $num] = explode(':', $token);
            $num = (int) $num;
            if ($kind === 'id') {
                $m = $existing->get($num);
                if (! $m) {
                    throw ValidationException::withMessages(['media_order' => 'A photo in the list does not belong to this product. Please reload the page.']);
                }
                $m->type === 'video' ? $videos++ : $images++;
            } else {
                $file = $newFiles[$num] ?? null;
                if (! $file instanceof UploadedFile) {
                    throw ValidationException::withMessages(['media_order' => 'One of the new files is missing. Please add it again.']);
                }
                $newIndexes[] = $num;
                str_starts_with((string) $file->getMimeType(), 'video/') ? $videos++ : $images++;
            }
        }
        foreach (array_keys($newFiles) as $i) {
            if (! in_array((int) $i, $newIndexes, true)) {
                throw ValidationException::withMessages(['new_files' => 'A new file was sent but is not in the list. Please try again.']);
            }
        }
        if ($images > self::MAX_IMAGES) {
            throw ValidationException::withMessages(['media_order' => 'You can add up to 8 photos.']);
        }
        if ($videos > self::MAX_VIDEOS) {
            throw ValidationException::withMessages(['media_order' => 'You can add 1 video.']);
        }

        // ── Save ──────────────────────────────────────────────────────────────
        $stored = [];       // files written in this request (deleted again if anything fails)
        $toDelete = [];     // files of removed items (deleted after commit)
        $disk = Storage::disk('public');

        try {
            DB::transaction(function () use ($product, $tokens, $newFiles, $posters, $meta, $existing, $disk, &$stored, &$toDelete) {
                $keep = [];
                foreach ($tokens as $order => $token) {
                    [$kind, $num] = explode(':', $token);
                    $num = (int) $num;

                    if ($kind === 'id') {
                        $existing[$num]->update(['sort_order' => $order]);
                        $keep[] = $num;
                        continue;
                    }

                    $file    = $newFiles[$num];
                    $isVideo = str_starts_with((string) $file->getMimeType(), 'video/');
                    $path    = $file->store($isVideo ? 'store-products/videos' : 'store-products', 'public');
                    $stored[] = $path;
                    $poster  = null;
                    if ($isVideo && ($posters[$num] ?? null) instanceof UploadedFile) {
                        $poster = $posters[$num]->store('store-products/posters', 'public');
                        $stored[] = $poster;
                    }
                    $info = json_decode((string) ($meta[$num] ?? ''), true) ?: [];

                    $m = ProductMedia::create([
                        'product_id'       => $product->id,
                        'type'             => $isVideo ? 'video' : 'image',
                        'path'             => $path,
                        'poster_path'      => $poster,
                        'duration_seconds' => $isVideo && isset($info['duration']) ? min(65535, (int) round((float) $info['duration'])) : null,
                        'width'            => isset($info['width']) ? min(65535, (int) $info['width']) : null,
                        'height'           => isset($info['height']) ? min(65535, (int) $info['height']) : null,
                        'sort_order'       => $order,
                    ]);
                    $keep[] = $m->id;
                }

                // Items no longer in the list
                foreach ($existing as $id => $m) {
                    if (! in_array($id, $keep, true)) {
                        $toDelete[] = $m->path;
                        if ($m->poster_path) {
                            $toDelete[] = $m->poster_path;
                        }
                        $m->delete();
                    }
                }

                $product->syncCoverFromMedia();
            });
        } catch (\Throwable $e) {
            $disk->delete($stored);   // no orphan files
            throw $e;
        }

        // A file may still be referenced by another row (e.g. the original cover copied in the migration) — only delete unused ones
        $stillUsed = ProductMedia::whereIn('path', $toDelete)->orWhereIn('poster_path', $toDelete)->pluck('path')->all();
        $disk->delete(array_diff($toDelete, $stillUsed));
    }

    /** Delete every media file of a product (permanent delete). */
    public static function deleteFiles(Product $product): void
    {
        $files = $product->media()->get()->flatMap(fn ($m) => array_filter([$m->path, $m->poster_path]))->all();
        if ($product->image) {
            $files[] = $product->image;
        }
        Storage::disk('public')->delete(array_unique($files));
    }
}
