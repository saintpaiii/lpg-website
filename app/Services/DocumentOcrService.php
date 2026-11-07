<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reads the text of a seller document with OCR.space ("Auto-read" on the admin store page).
 * Read and WARN only — the admin always decides. No API key → skipped (returns null, no error).
 *
 * Free tier: 1 MB per file, PDFs up to 3 pages. Images over 1 MB are downscaled with GD first
 * (EXIF orientation applied, transparency flattened onto white, longest side 1800 px, JPEG 80).
 */
class DocumentOcrService
{
    public const MAX_BYTES = 1024 * 1024;
    private const MAX_SIDE   = 1800;
    private const MAX_PIXELS_SIDE = 6000;   // bigger than this → don't load it into memory

    /** Why the last read() returned null: 'no_key' | 'too_large' | 'missing' | 'error' | null */
    public static ?string $lastProblem = null;

    public static function enabled(): bool
    {
        return (string) config('services.ocr_space.key') !== '';
    }

    /** Full text of the document, or null (see $lastProblem). */
    public static function read(string $localPath): ?string
    {
        static::$lastProblem = null;

        if (! static::enabled()) {
            static::$lastProblem = 'no_key';

            return null;
        }
        if (! is_file($localPath)) {
            static::$lastProblem = 'missing';

            return null;
        }

        $ext  = strtolower(pathinfo($localPath, PATHINFO_EXTENSION));
        $temp = null;
        $send = $localPath;

        if (filesize($localPath) > self::MAX_BYTES) {
            if ($ext === 'pdf') {
                static::$lastProblem = 'too_large';

                return null;
            }
            $temp = static::downscale($localPath);
            if ($temp === null) {
                static::$lastProblem = 'too_large';

                return null;
            }
            $send = $temp;
            $ext  = 'jpg';
        }

        try {
            $res = Http::timeout(30)
                ->asMultipart()
                ->attach('file', file_get_contents($send), 'document.' . ($ext ?: 'jpg'))
                ->post((string) config('services.ocr_space.url'), [
                    'apikey'            => (string) config('services.ocr_space.key'),
                    'language'          => 'eng',
                    'OCREngine'         => '2',
                    'scale'             => 'true',
                    'isTable'           => 'false',
                    'filetype'          => strtoupper($ext === 'jpeg' ? 'jpg' : $ext),
                ]);

            $json = $res->json();
            if (! $res->successful() || ! is_array($json) || ! empty($json['IsErroredOnProcessing'])) {
                Log::warning('OCR.space failed', [
                    'status'  => $res->status(),
                    'message' => is_array($json) ? ($json['ErrorMessage'] ?? null) : null,
                ]);
                static::$lastProblem = 'error';

                return null;
            }

            return trim(collect($json['ParsedResults'] ?? [])->pluck('ParsedText')->filter()->implode("\n"));
        } catch (\Throwable $e) {
            Log::warning('OCR.space request error: ' . $e->getMessage());
            static::$lastProblem = 'error';

            return null;
        } finally {
            if ($temp) {
                @unlink($temp);
            }
        }
    }

    /** Downscaled JPEG copy in a temp file (caller deletes it), or null when the image can't be handled. */
    public static function downscale(string $path): ?string
    {
        // GD not enabled (php.ini ";extension=gd") → can't shrink; the caller shows "Too large to read automatically"
        if (! function_exists('imagecreatetruecolor')) {
            Log::warning('OCR: GD is not enabled — images over 1 MB are not auto-read. Enable extension=gd in php.ini.');

            return null;
        }

        $info = @getimagesize($path);
        if (! $info || $info[0] < 1 || $info[1] < 1) {
            return null;
        }
        [$w, $h, $type] = $info;
        if ($w > self::MAX_PIXELS_SIDE || $h > self::MAX_PIXELS_SIDE) {
            return null;   // memory guard
        }

        $src = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG  => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false,
            default        => false,
        };
        if (! $src) {
            return null;
        }

        // Phone photos: apply the EXIF orientation first
        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $orientation = (int) (@exif_read_data($path)['Orientation'] ?? 1);
            $rotated = match ($orientation) {
                3 => imagerotate($src, 180, 0),
                6 => imagerotate($src, -90, 0),
                8 => imagerotate($src, 90, 0),
                default => null,
            };
            if ($rotated) {
                imagedestroy($src);
                $src = $rotated;
                [$w, $h] = [imagesx($src), imagesy($src)];
            }
        }

        $scale = min(1, self::MAX_SIDE / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));

        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));   // PNG transparency → white
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        $out = tempnam(sys_get_temp_dir(), 'ocr') . '.jpg';
        imagejpeg($dst, $out, 80);
        imagedestroy($dst);

        return filesize($out) <= self::MAX_BYTES ? $out : (function () use ($out) { @unlink($out); return null; })();
    }
}
