<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Approximate centre point of a Cavite barangay, used to place text addresses
 * (city + barangay) on the map when the customer didn't drop a pin.
 */
class BarangayCoordinate extends Model
{
    public $timestamps = false;

    protected $fillable = ['city', 'barangay', 'latitude', 'longitude'];

    protected function casts(): array
    {
        return ['latitude' => 'float', 'longitude' => 'float'];
    }

    /** Normalised key: lowercase, no accents, no "City of"/" City" suffix (except Cavite City). */
    public static function normalizeCity(?string $city): string
    {
        $c = static::normalize($city);
        $c = preg_replace('/^city of /', '', $c);
        return $c === 'cavite city' ? $c : preg_replace('/ city$/', '', $c);
    }

    public static function normalize(?string $s): string
    {
        $s = strtolower(trim((string) $s));
        $s = strtr($s, ['ñ' => 'n', 'Ñ' => 'n', 'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);
        return preg_replace('/\s+/', ' ', $s);
    }

    /**
     * Base barangay name without numbered/lettered/directional subdivisions:
     * "Talaba IV" → "talaba", "Alapan II-A" → "alapan", "Maharlika East" → "maharlika",
     * "Zone 1" stays "zone 1" (handled by the exact match first).
     */
    public static function baseBarangay(?string $barangay): string
    {
        $b = static::normalize($barangay);
        $b = preg_replace('/\s*-\s*[a-z]$/', '', $b);                                  // "-a"
        $b = preg_replace('/\s+(i{1,3}|iv|v|vi{0,3}|ix|x{1,3})(-?[a-z])?$/', '', $b);  // roman numerals
        $b = preg_replace('/\s+\d+[a-z]?$/', '', $b);                                    // trailing digits
        $b = preg_replace('/\s+(east|west|north|south|proper|central)$/', '', $b);
        return trim($b);
    }

    /**
     * [lat, lng] for a city + barangay, or null when unknown. Tries an exact match,
     * then the base barangay name (e.g. "Talaba IV" → Talaba). No city-level guess.
     */
    public static function lookup(?string $city, ?string $barangay): ?array
    {
        if (! $city || ! $barangay) {
            return null;
        }

        static $index = null;
        if ($index === null) {
            $index = ['exact' => [], 'base' => []];
            foreach (static::all() as $row) {
                $cityKey = static::normalizeCity($row->city);
                $index['exact'][$cityKey . '|' . static::normalize($row->barangay)] = [$row->latitude, $row->longitude];
                $index['base'][$cityKey . '|' . static::baseBarangay($row->barangay)] ??= [$row->latitude, $row->longitude];
            }
        }

        $cityKey = static::normalizeCity($city);

        return $index['exact'][$cityKey . '|' . static::normalize($barangay)]
            ?? $index['base'][$cityKey . '|' . static::baseBarangay($barangay)]
            ?? null;
    }
}
