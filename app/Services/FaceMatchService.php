<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Compares the face on an ID / driver's license with a live selfie (Face++ Compare API, server-side only).
 *
 * Result: ['status' => passed|failed|no_face|skipped|error, 'score' => ?float, 'needed' => ?float, 'message' => string]
 * passed = confidence >= the API's "1e-4" threshold. Anything else is NOT approved automatically (admin reviews).
 * No key → skipped (never an error page). FACEPP_FAKE=pass|fail → no API call (demo / tests).
 * The key / secret are never logged.
 */
class FaceMatchService
{
    private const MAX_SIDE  = 1600;
    private const MAX_BYTES = 2 * 1024 * 1024;
    private const MAX_PIXELS_SIDE = 8000;   // bigger than this → don't load it into memory

    /** True when a check can give a real (or fake) result — false = every check is "skipped". */
    public static function enabled(): bool
    {
        return static::fakeMode() !== null
            || ((string) config('services.facepp.key') !== '' && (string) config('services.facepp.secret') !== '');
    }

    private static function fakeMode(): ?string
    {
        $fake = strtolower(trim((string) config('services.facepp.fake')));

        return in_array($fake, ['pass', 'fail'], true) ? $fake : null;
    }

    /**
     * @param string $documentPath absolute local path of the ID / license (image or PDF)
     * @param string $selfiePath   absolute local path of the live selfie
     */
    public static function compare(string $documentPath, string $selfiePath, string $docLabel = 'ID'): array
    {
        if ($fake = static::fakeMode()) {
            return $fake === 'pass'
                ? static::result('passed', 95.0, 69.0, 'Face match 95% (needed 69%) — test mode')
                : static::result('failed', 30.0, 69.0, 'Face match 30% — needed 69% (test mode)');
        }

        if (! static::enabled()) {
            return static::result('skipped', null, null, 'Face check unavailable (not set up)');
        }
        if (! is_file($documentPath) || ! is_file($selfiePath)) {
            return static::result('error', null, null, 'Face check unavailable (file missing)');
        }
        if (strtolower(pathinfo($documentPath, PATHINFO_EXTENSION)) === 'pdf') {
            return static::result('skipped', null, null, "The {$docLabel} is a PDF — faces can only be compared on photos");
        }

        $doc = static::prepare($documentPath);
        $selfie = static::prepare($selfiePath);
        try {
            if (! $doc || ! $selfie) {
                return static::result('error', null, null, 'Face check unavailable (photo could not be read)');
            }

            $json = static::call($doc, $selfie);
            if (($json['error_message'] ?? null) === 'CONCURRENCY_LIMIT_EXCEEDED') {
                sleep(1);   // free key: one request at a time — wait and retry ONCE
                $json = static::call($doc, $selfie);
            }

            if (! is_array($json)) {
                return static::result('error', null, null, 'Face check unavailable (no answer from the service)');
            }
            if (isset($json['error_message'])) {
                // Only the error code — never the request (it holds the key)
                Log::warning('Face++ compare error', ['error' => (string) $json['error_message']]);

                return static::result('error', null, null, 'Face check unavailable (' . static::errorText((string) $json['error_message']) . ')');
            }
            if (! isset($json['confidence'])) {
                $where = empty($json['faces1']) ? "No face found on the {$docLabel}" : 'No face found in the selfie';

                return static::result('no_face', null, null, $where);
            }

            $score  = round((float) $json['confidence'], 2);
            $needed = isset($json['thresholds']['1e-4']) ? round((float) $json['thresholds']['1e-4'], 2) : null;
            if ($needed === null) {
                return static::result('error', $score, null, 'Face check unavailable (no threshold returned)');
            }

            return $score >= $needed
                ? static::result('passed', $score, $needed, 'Face match ' . static::pct($score) . ' (needed ' . static::pct($needed) . ')')
                : static::result('failed', $score, $needed, 'Face match ' . static::pct($score) . ' — needed ' . static::pct($needed));
        } finally {
            foreach ([$doc, $selfie] as $tmp) {
                if ($tmp) {
                    @unlink($tmp);
                }
            }
        }
    }

    /** Column values for verification_requests / staff_documents. */
    public static function columns(array $r): array
    {
        return [
            'face_match_status'  => $r['status'],
            'face_match_score'   => $r['score'],
            'face_match_needed'  => $r['needed'],
            'face_match_message' => mb_substr($r['message'], 0, 255),
            'face_checked_at'    => now(),
        ];
    }

    /** What the admin / owner pages show (null status + no selfie = uploaded before the face check existed). */
    public static function present($model): array
    {
        return [
            'status'  => $model->face_match_status,
            'score'   => $model->face_match_score !== null ? (float) $model->face_match_score : null,
            'needed'  => $model->face_match_needed !== null ? (float) $model->face_match_needed : null,
            'message' => $model->face_match_message,
            'auto'    => (bool) $model->auto_approved,
            'checked' => $model->face_checked_at?->timezone('Asia/Manila')->format('M j, Y g:i A'),
        ];
    }

    /** Plain words for the person who uploaded ("We couldn't confirm your photo automatically ({reason})"). */
    public static function reasonForUser(?string $status, string $docLabel = 'ID'): string
    {
        return match ($status) {
            'failed'  => "your selfie and the photo on your {$docLabel} didn't match clearly enough",
            'no_face' => "we couldn't find a face on your {$docLabel} or in your selfie",
            'error'   => 'the automatic check is not working right now',
            default   => 'the automatic check is not available',
        };
    }

    public static function pct(?float $v): string
    {
        return $v === null ? '—' : ((int) round($v)) . '%';
    }

    private static function result(string $status, ?float $score, ?float $needed, string $message): array
    {
        return ['status' => $status, 'score' => $score, 'needed' => $needed, 'message' => $message];
    }

    private static function call(string $doc, string $selfie): ?array
    {
        try {
            $res = Http::timeout((int) config('services.facepp.timeout', 15))
                ->asMultipart()
                ->attach('image_file1', file_get_contents($doc), 'document.jpg')
                ->attach('image_file2', file_get_contents($selfie), 'selfie.jpg')
                ->post((string) config('services.facepp.endpoint'), [
                    'api_key'    => (string) config('services.facepp.key'),
                    'api_secret' => (string) config('services.facepp.secret'),
                ]);
            $json = $res->json();

            return is_array($json) ? $json : null;
        } catch (\Throwable $e) {
            // The exception message can contain the request URL but never the form fields (key / secret)
            Log::warning('Face++ compare request failed: ' . class_basename($e));

            return null;
        }
    }

    private static function errorText(string $code): string
    {
        return match (true) {
            str_starts_with($code, 'AUTHENTICATION_ERROR'), str_starts_with($code, 'AUTHORIZATION_ERROR') => 'wrong API key',
            $code === 'CONCURRENCY_LIMIT_EXCEEDED'                                                     => 'service busy',
            str_contains($code, 'IMAGE')                                                               => 'photo not accepted',
            default                                                                                     => 'service error',
        };
    }

    /**
     * A JPEG copy in a temp file (caller deletes it): EXIF orientation applied, transparency on white,
     * longest side ≤ 1600 px, under 2 MB. Null when the file isn't a usable image.
     */
    private static function prepare(string $path): ?string
    {
        $info = @getimagesize($path);
        if (! $info || $info[0] < 1 || $info[1] < 1) {
            return null;
        }
        [$w, $h, $type] = $info;

        if (! function_exists('imagecreatetruecolor')) {
            // GD not enabled: send the original when the API would accept it as-is
            if (in_array($type, [IMAGETYPE_JPEG, IMAGETYPE_PNG], true) && filesize($path) <= self::MAX_BYTES && max($w, $h) <= 4096) {
                $copy = tempnam(sys_get_temp_dir(), 'face');
                copy($path, $copy);

                return $copy;
            }
            Log::warning('Face check: GD is not enabled — large photos cannot be compared. Enable extension=gd in php.ini.');

            return null;
        }
        if ($w > self::MAX_PIXELS_SIDE || $h > self::MAX_PIXELS_SIDE) {
            return null;
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

        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $rotated = match ((int) (@exif_read_data($path)['Orientation'] ?? 1)) {
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
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);

        $out = tempnam(sys_get_temp_dir(), 'face');
        foreach ([88, 75, 60] as $quality) {
            imagejpeg($dst, $out, $quality);
            clearstatcache(true, $out);
            if (filesize($out) <= self::MAX_BYTES) {
                imagedestroy($dst);

                return $out;
            }
        }
        imagedestroy($dst);
        @unlink($out);

        return null;
    }
}
