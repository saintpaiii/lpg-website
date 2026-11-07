<?php

namespace App\Support;

/**
 * Plain-English messages for photo / document uploads. Laravel checks a file's real content, not its name
 * (a "validid.jpg" saved from Google is often a WEBP) — so the message names the formats that are accepted.
 */
class UploadMessages
{
    public const WITH_PDF  = 'Use a JPG, PNG, WEBP or PDF file.';
    public const IMAGE_ONLY = 'Use a JPG, PNG or WEBP file.';

    /**
     * Messages for the given fields (wildcards like other_documents.*.file are fine).
     * @param list<string> $fields
     */
    public static function for(array $fields, bool $pdf = true): array
    {
        $msg = $pdf ? self::WITH_PDF : self::IMAGE_ONLY;
        $out = [];
        foreach ($fields as $f) {
            $out["{$f}.mimes"]     = $msg;
            $out["{$f}.mimetypes"] = $msg;
            $out["{$f}.image"]     = self::IMAGE_ONLY;
            $out["{$f}.file"]      = $msg;
            $out["{$f}.uploaded"]  = 'The file failed to upload — it may be too big. Try a smaller file.';
        }

        return $out;
    }
}
