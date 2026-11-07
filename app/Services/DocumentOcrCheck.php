<?php

namespace App\Services;

use App\Models\Store;
use App\Support\StoreDocuments;
use Illuminate\Support\Carbon;

/**
 * Turns OCR text into hints for the admin: dates found, the likely expiry date, a TIN, whether the business /
 * owner name appears, and plain-English warnings. Auto-read can be wrong — it never approves or rejects anything.
 */
class DocumentOcrCheck
{
    private const MONTHS = [
        'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6,
        'jul' => 7, 'aug' => 8, 'sep' => 9, 'sept' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12,
    ];

    private const EXPIRY_WORDS = ['valid until', 'valid up to', 'valid till', 'validity', 'expiry', 'expires', 'expiration', 'until'];

    /**
     * @param string $docType a StoreDocuments::TYPES key, 'valid_id' or 'other'
     * @return array{read_at:string,text:string,likely_expiry:?string,found_tin:?string,name_match:?bool,found_dates:array,warnings:array}
     */
    public static function analyze(Store $store, string $docType, string $text, ?string $typedExpiry): array
    {
        $text     = trim($text);
        $warnings = [];

        if (mb_strlen(preg_replace('/\s+/', '', $text)) < 15) {
            return static::result($text, null, null, null, [], ['No text could be read (blurry photo?).']);
        }

        $dates  = static::findDates($text);
        $expiry = $docType === 'valid_id' ? null : static::likelyExpiry($text, $dates);
        $tin    = preg_match('/\b\d{3}-?\d{3}-?\d{3}(?:-?\d{3,5})?\b/', $text, $m) ? $m[0] : null;

        // Name check: the owner's name on the ID; the store (or owner) name on business documents
        $owner = (string) ($store->owner?->name ?? '');
        if ($docType === 'valid_id') {
            $nameMatch = $owner !== '' ? static::nameFound($owner, $text) : null;
            if ($nameMatch === false) {
                $warnings[] = "Owner name '{$owner}' was not found on this ID.";
            }
        } else {
            $nameMatch = static::nameFound((string) $store->store_name, $text) || ($owner !== '' && static::nameFound($owner, $text));
            if (! $nameMatch) {
                $warnings[] = "Business name '{$store->store_name}' was not found on this document.";
            }
        }

        if ($expiry && $typedExpiry) {
            $typed = Carbon::parse($typedExpiry)->toDateString();
            if ($typed !== $expiry) {
                $warnings[] = 'Expiry date on the document looks like ' . Carbon::parse($expiry)->format('M j, Y')
                    . ' — the seller typed ' . Carbon::parse($typed)->format('M j, Y') . '.';
            }
        } elseif ($typedExpiry && StoreDocuments::expiryColumn($docType) && ! $expiry) {
            $warnings[] = 'No expiry date was found on the document — check it by eye.';
        }
        if ($expiry && Carbon::parse($expiry)->lt(StoreDocuments::today())) {
            $warnings[] = 'The date on the document (' . Carbon::parse($expiry)->format('M j, Y') . ') is already past.';
        }
        if ($docType === 'bir_permit' && ! $tin) {
            $warnings[] = 'No TIN was found on the BIR certificate.';
        }

        return static::result($text, $expiry, $tin, $nameMatch, $dates, $warnings);
    }

    /** Result for a document that couldn't be read at all ('no_key', 'too_large', 'error', 'missing'). */
    public static function unavailable(string $problem): array
    {
        $msg = match ($problem) {
            'too_large' => 'Too large to read automatically',
            'missing'   => 'File not found',
            default     => 'Auto-read not available',
        };

        return ['read_at' => now()->toIso8601String(), 'text' => '', 'likely_expiry' => null, 'found_tin' => null,
            'name_match' => null, 'found_dates' => [], 'warnings' => [], 'unavailable' => $msg, 'problem' => $problem];
    }

    private static function result(string $text, ?string $expiry, ?string $tin, ?bool $nameMatch, array $dates, array $warnings): array
    {
        return [
            'read_at'       => now()->toIso8601String(),
            'text'          => mb_substr($text, 0, 3000),
            'likely_expiry' => $expiry,
            'found_tin'     => $tin,
            'name_match'    => $nameMatch,
            'found_dates'   => array_values(array_unique(array_column($dates, 'date'))),
            'warnings'      => $warnings,
        ];
    }

    /**
     * Dates in the text with their position: "December 31, 2026", "Dec. 31, 2026", "12/31/2026", "2026-12-31", "31 December 2026".
     * @return list<array{date:string,pos:int}>
     */
    public static function findDates(string $text): array
    {
        $out = [];
        $mon = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
        $add = function (int $y, int $m, int $d, int $pos) use (&$out) {
            if ($y >= 1950 && $y <= 2100 && checkdate($m, $d, $y)) {
                $out[] = ['date' => sprintf('%04d-%02d-%02d', $y, $m, $d), 'pos' => $pos];
            }
        };

        // Month D, YYYY  /  Mon. D YYYY
        preg_match_all('/\b' . $mon . '\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i', $text, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($m as $x) {
            $add((int) $x[3][0], static::month($x[1][0]), (int) $x[2][0], $x[0][1]);
        }
        // D Month YYYY
        preg_match_all('/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?' . $mon . '\.?,?\s+(\d{4})\b/i', $text, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($m as $x) {
            $add((int) $x[3][0], static::month($x[2][0]), (int) $x[1][0], $x[0][1]);
        }
        // YYYY-MM-DD
        preg_match_all('/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/', $text, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($m as $x) {
            $add((int) $x[1][0], (int) $x[2][0], (int) $x[3][0], $x[0][1]);
        }
        // MM/DD/YYYY (Philippine documents use month first)
        preg_match_all('/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/', $text, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($m as $x) {
            $add((int) $x[3][0], (int) $x[1][0], (int) $x[2][0], $x[0][1]);
        }

        usort($out, fn ($a, $b) => $a['pos'] <=> $b['pos']);

        return $out;
    }

    /** The date right after "valid until" / "expiry" / …, else the latest future date. */
    public static function likelyExpiry(string $text, array $dates): ?string
    {
        if ($dates === []) {
            return null;
        }
        $lower = mb_strtolower($text);
        $best  = null;
        foreach (self::EXPIRY_WORDS as $word) {
            $offset = 0;
            while (($p = strpos($lower, $word, $offset)) !== false) {
                foreach ($dates as $d) {
                    $gap = $d['pos'] - ($p + strlen($word));
                    if ($gap >= 0 && $gap <= 60 && ($best === null || $gap < $best['gap'])) {
                        $best = ['gap' => $gap, 'date' => $d['date']];
                    }
                }
                $offset = $p + 1;
            }
            if ($best) {
                return $best['date'];
            }
        }

        $future = array_filter(array_column($dates, 'date'), fn ($d) => $d >= StoreDocuments::today()->toDateString());

        return $future ? max($future) : null;
    }

    /** Case / punctuation-insensitive: all words present, or ≥ 70% similar to some stretch of the text. */
    public static function nameFound(string $name, string $text): bool
    {
        $norm = fn (string $s) => trim(preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower($s))));
        $n = $norm($name);
        $t = $norm($text);
        if ($n === '' || $t === '') {
            return false;
        }
        if (str_contains($t, $n) || str_contains(str_replace(' ', '', $t), str_replace(' ', '', $n))) {
            return true;
        }

        $words = array_filter(explode(' ', $n), fn ($w) => strlen($w) >= 2);
        $tw    = explode(' ', $t);
        if ($words && count(array_diff($words, $tw)) === 0) {
            return true;
        }

        // Sliding window of the same number of words
        $k = max(1, count(explode(' ', $n)));
        for ($i = 0; $i + $k <= count($tw); $i++) {
            similar_text($n, implode(' ', array_slice($tw, $i, $k)), $pct);
            if ($pct >= 70) {
                return true;
            }
        }

        return false;
    }

    private static function month(string $s): int
    {
        $k = strtolower(rtrim(substr($s, 0, 4), '.'));

        return self::MONTHS[$k] ?? self::MONTHS[substr($k, 0, 3)] ?? 1;
    }
}
