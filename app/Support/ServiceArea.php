<?php

namespace App\Support;

use App\Http\Controllers\BarangayCoordinateController;

/**
 * The area the platform serves: mainland Cavite.
 *
 * contains() checks the province outline in resources/data/cavite-boundary.json (PSA 2023 boundaries, simplified,
 * ~250 m margin, [lat, lng] pairs) — the same outline as isInServiceArea() in resources/js/lib/map.ts.
 * The SOUTH/NORTH/WEST/EAST rectangle is only the map pan limit (SERVICE_AREA_BOUNDS in map.ts).
 */
class ServiceArea
{
    public const SOUTH = 14.00;
    public const NORTH = 14.60;
    public const WEST  = 120.50;
    public const EAST  = 121.15;

    public const CENTER = BarangayCoordinateController::CAVITE_CENTER;

    public const MESSAGE = 'Please choose a location inside Cavite. We only serve addresses within Cavite.';

    /** @var array{0: array<int, array{0: float, 1: float}>, 1: array{0: float, 1: float, 2: float, 3: float}}|null */
    private static ?array $outline = null;

    public static function contains(float $lat, float $lng): bool
    {
        [$points, [$south, $north, $west, $east]] = self::outline();

        // Quick bounding-box check first
        if ($lat < $south || $lat > $north || $lng < $west || $lng > $east) {
            return false;
        }

        // Point in polygon (ray casting)
        $inside = false;
        $n = count($points);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$latI, $lngI] = $points[$i];
            [$latJ, $lngJ] = $points[$j];
            if ((($latI > $lat) !== ($latJ > $lat))
                && ($lng < ($lngJ - $lngI) * ($lat - $latI) / ($latJ - $latI) + $lngI)) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }

    /** The outline and its bounding box, loaded once (works without the Laravel app booted, e.g. unit tests). */
    private static function outline(): array
    {
        if (self::$outline === null) {
            $points = json_decode(file_get_contents(__DIR__ . '/../../resources/data/cavite-boundary.json'), true);
            $lats = array_column($points, 0);
            $lngs = array_column($points, 1);
            self::$outline = [$points, [min($lats), max($lats), min($lngs), max($lngs)]];
        }

        return self::$outline;
    }
}
