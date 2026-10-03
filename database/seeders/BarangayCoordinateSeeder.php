<?php

namespace Database\Seeders;

use App\Models\BarangayCoordinate;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Barangay centre points for Cavite, used to auto-pin text addresses on maps.
 *
 * Source: database/data/barangay_coordinates.json — the centre of each barangay's official
 * boundary in OpenStreetMap (via Nominatim), one entry per barangay in the address dropdown
 * (resources/js/data/cavite-locations.ts). Data © OpenStreetMap contributors, ODbL.
 *
 * The earlier hand-typed points were often wrong (e.g. every General Mariano Alvarez barangay
 * actually sat in Paliparan, Dasmariñas), so rows not in the data file are removed.
 * Barangays OSM couldn't place fall back to the city centre in BarangayCoordinateController.
 *
 * Safe to re-run: upserts on (city, barangay).
 */
class BarangayCoordinateSeeder extends Seeder
{
    public function run(): void
    {
        $rows = collect(json_decode(file_get_contents(database_path('data/barangay_coordinates.json')), true))
            ->map(fn ($r) => [
                'city'      => $r['city'],
                'barangay'  => $r['barangay'],
                'latitude'  => $r['latitude'],
                'longitude' => $r['longitude'],
            ])->all();

        DB::transaction(function () use ($rows) {
            foreach (array_chunk($rows, 200) as $chunk) {
                BarangayCoordinate::upsert($chunk, ['city', 'barangay'], ['latitude', 'longitude']);
            }

            // Drop stale hand-typed rows that aren't in the verified data
            $keep = collect($rows)->map(fn ($r) => mb_strtolower($r['city'] . '|' . $r['barangay']))->flip();
            BarangayCoordinate::all()
                ->reject(fn ($r) => $keep->has(mb_strtolower($r->city . '|' . $r->barangay)))
                ->each->delete();
        });
    }
}
