<?php

namespace App\Support;

use Illuminate\Support\Collection;

/**
 * LPG tank sizes from products.weight (free text typed by sellers: "11kg", "11 kg", "2.7kg", "11.0 KG").
 */
class LpgSize
{
    /** Kilograms from the first number in the text (1 decimal), or null when there is no number. */
    public static function parseKg(?string $weight): ?float
    {
        if ($weight === null || ! preg_match('/\d+(?:[.,]\d+)?/', $weight, $m)) {
            return null;
        }
        $kg = round((float) str_replace(',', '.', $m[0]), 1);

        return $kg > 0 ? $kg : null;
    }

    /** "2.7 kg", "11 kg" (no trailing .0). */
    public static function label(float $kg): string
    {
        return rtrim(rtrim(number_format($kg, 1, '.', ''), '0'), '.') . ' kg';
    }

    /**
     * Distinct raw weight strings grouped by their parsed size, smallest first.
     * Unparseable strings are skipped.
     *
     * @param  iterable<string>  $weights
     * @return Collection<int, array{kg: float, label: string, raw: string[]}>
     */
    public static function group(iterable $weights): Collection
    {
        $groups = [];
        foreach ($weights as $w) {
            $kg = static::parseKg($w);
            if ($kg === null) {
                continue;
            }
            $key = number_format($kg, 1, '.', '');
            $groups[$key] ??= ['kg' => $kg, 'label' => static::label($kg), 'raw' => []];
            $groups[$key]['raw'][] = $w;
        }

        return collect($groups)->sortBy('kg')->values();
    }
}
