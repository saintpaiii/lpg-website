<?php

namespace App\Support;

use App\Http\Controllers\BarangayCoordinateController;

/**
 * The area the platform serves: Cavite plus a ~5 km margin.
 * Same numbers as SERVICE_AREA in resources/js/lib/map.ts.
 */
class ServiceArea
{
    public const SOUTH = 14.00;
    public const NORTH = 14.60;
    public const WEST  = 120.50;
    public const EAST  = 121.15;

    public const CENTER = BarangayCoordinateController::CAVITE_CENTER;

    public const MESSAGE = 'Please choose a location inside Cavite. We only serve addresses within Cavite.';

    public static function contains(float $lat, float $lng): bool
    {
        return $lat >= self::SOUTH && $lat <= self::NORTH && $lng >= self::WEST && $lng <= self::EAST;
    }
}
