<?php

namespace App\Http\Controllers;

use App\Models\BarangayCoordinate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Approximate coordinates for a Cavite city + barangay (used to auto-pin addresses on maps). */
class BarangayCoordinateController extends Controller
{
    /** Default view when nothing matches: Cavite. */
    public const CAVITE_CENTER = [14.4791, 120.8970];

    public function getCoordinates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'city'     => 'required|string|max:100',
            'barangay' => 'required|string|max:100',
        ]);

        return response()->json(static::resolve($data['city'], $data['barangay']));
    }

    /**
     * Barangay match (exact, then base name like "Talaba IV" → Talaba), else the
     * city's centre (average of its known barangays), else Cavite's centre.
     */
    public static function resolve(?string $city, ?string $barangay): array
    {
        if ($geo = BarangayCoordinate::lookup($city, $barangay)) {
            return ['found' => true, 'precision' => 'barangay', 'latitude' => $geo[0], 'longitude' => $geo[1]];
        }

        $cityKey = BarangayCoordinate::normalizeCity($city);
        $rows    = BarangayCoordinate::all()->filter(fn ($r) => BarangayCoordinate::normalizeCity($r->city) === $cityKey);

        // City centre = average of the city's (OSM-verified) barangay centres
        $center  = $rows->isNotEmpty() ? [round($rows->avg('latitude'), 7), round($rows->avg('longitude'), 7)] : null;

        if ($cityKey !== '' && $center) {
            return [
                'found'     => false,
                'precision' => 'city',
                'latitude'  => $center[0],
                'longitude' => $center[1],
                'message'   => 'Barangay not found, showing city center. Please drag the pin to your exact location.',
            ];
        }

        return [
            'found'     => false,
            'precision' => 'none',
            'latitude'  => self::CAVITE_CENTER[0],
            'longitude' => self::CAVITE_CENTER[1],
            'message'   => 'Location not found. Please drag the pin to your delivery address.',
        ];
    }

    /** Where the customer's typed address is, as [lat, lng] — null when the city isn't recognised. */
    public static function addressPoint(?string $city, ?string $barangay): ?array
    {
        $geo = static::resolve($city, $barangay);

        return $geo['precision'] === 'none' ? null : [(float) $geo['latitude'], (float) $geo['longitude']];
    }

    public static function distanceKm(array $a, array $b): float
    {
        return \App\Services\DeliveryRouteService::haversineKm($a[0], $a[1], $b[0], $b[1]);
    }
}
