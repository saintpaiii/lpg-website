<?php

use App\Support\ServiceArea;

// Cavite outline (resources/data/cavite-boundary.json) — towns inside Cavite are accepted, neighbouring provinces are not.

it('accepts points inside Cavite', function (string $place, float $lat, float $lng) {
    expect(ServiceArea::contains($lat, $lng))->toBeTrue("{$place} should be inside Cavite");
})->with([
    'Dasmariñas'  => ['Dasmariñas', 14.3294, 120.9367],
    'Bacoor'      => ['Bacoor', 14.4590, 120.9500],
    'Tagaytay'    => ['Tagaytay', 14.1153, 120.9621],
    'Paliparan'   => ['Paliparan', 14.3108, 120.9921],
    'Carmona'     => ['Carmona', 14.3132, 121.0576],
    'Ternate'     => ['Ternate', 14.2890, 120.7170],
    'Cavite City' => ['Cavite City', 14.4791, 120.8970],
]);

it('refuses points outside Cavite', function (string $place, float $lat, float $lng) {
    expect(ServiceArea::contains($lat, $lng))->toBeFalse("{$place} should be outside Cavite");
})->with([
    'Taguig/Pasig'        => ['Taguig/Pasig', 14.534985, 121.065216],
    'Sto. Tomas, Batangas' => ['Sto. Tomas, Batangas', 14.0812, 121.1366],
    'Las Piñas'           => ['Las Piñas', 14.4445, 120.9939],
    'Biñan'               => ['Biñan', 14.3420, 121.0800],
    'Manila'              => ['Manila', 14.5995, 120.9842],
    'Talisay, Batangas'   => ['Talisay, Batangas', 14.0950, 121.0140],
]);

it('contains every barangay centre we know', function () {
    $rows = json_decode(file_get_contents(__DIR__ . '/../../database/data/barangay_coordinates.json'), true);
    $outside = [];
    foreach ($rows as $r) {
        $lat = (float) ($r['latitude'] ?? $r['lat'] ?? 0);
        $lng = (float) ($r['longitude'] ?? $r['lng'] ?? 0);
        if (! ServiceArea::contains($lat, $lng)) {
            $outside[] = ($r['barangay'] ?? '?') . ', ' . ($r['city'] ?? '?');
        }
    }
    expect($outside)->toBe([]);
});
