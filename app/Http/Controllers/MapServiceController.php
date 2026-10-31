<?php

namespace App\Http\Controllers;

use App\Models\BarangayCoordinate;
use App\Support\ServiceArea;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Server-side proxies for the free OpenStreetMap services (no API keys):
 *  - geocode(): Nominatim address search, limited to Cavite.
 *    Usage policy: max 1 request/second, identifying User-Agent, cache results.
 *  - reverse(): Nominatim reverse lookup → street + a city/barangay from our Cavite list.
 *  - route():   OSRM road geometry for a whole multi-stop route in ONE request, cached.
 * Proxying avoids CORS issues, lets every user share the cache, and keeps us inside the rate limits.
 */
class MapServiceController extends Controller
{
    private const USER_AGENT = 'LPG-Platform/1.0 (Cavite LPG distributor platform)';

    /** Cavite bounding box for Nominatim: left, top, right, bottom. */
    private const CAVITE_VIEWBOX = '120.55,14.55,121.10,14.05';

    /** OSRM servers tried in order (same public data; the second is the FOSSGIS car profile). */
    private const OSRM_SERVERS = [
        'https://router.project-osrm.org/route/v1/driving/',
        'https://routing.openstreetmap.de/routed-car/route/v1/driving/',
    ];

    public function geocode(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 3) {
            return response()->json([]);
        }
        $q = mb_substr($q, 0, 120);

        $results = Cache::remember('geocode:' . md5(mb_strtolower($q)), now()->addDay(), function () use ($q) {
            $this->waitForNominatimSlot();
            try {
                $res = Http::withHeaders(['User-Agent' => self::USER_AGENT, 'Accept-Language' => 'en'])
                    ->timeout(8)
                    ->get('https://nominatim.openstreetmap.org/search', [
                        'q'              => $q . ', Cavite, Philippines',
                        'format'         => 'json',
                        'limit'          => 5,
                        'countrycodes'   => 'ph',
                        'addressdetails' => 1,
                        'viewbox'        => self::CAVITE_VIEWBOX,
                        'bounded'        => 1,
                    ]);
            } catch (\Throwable $e) {
                Log::warning('Nominatim search failed', ['q' => $q, 'error' => $e->getMessage()]);
                return null;   // not cached (Cache::remember skips null)
            }
            if (! $res->ok()) {
                return null;
            }

            return collect($res->json() ?? [])->map(fn ($r) => [
                'display_name' => $r['display_name'] ?? '',
                'lat'          => (float) ($r['lat'] ?? 0),
                'lng'          => (float) ($r['lon'] ?? 0),
                // Best-effort split into our address fields
                'street'       => trim(implode(' ', array_filter([$r['address']['house_number'] ?? null, $r['address']['road'] ?? null]))) ?: ($r['name'] ?? null),
                'barangay'     => $r['address']['quarter'] ?? $r['address']['village'] ?? $r['address']['suburb'] ?? $r['address']['neighbourhood'] ?? null,
                'city'         => $r['address']['city'] ?? $r['address']['town'] ?? $r['address']['municipality'] ?? null,
            ])->filter(fn ($r) => $r['lat'] && $r['lng'])->values()->all();
        });

        return response()->json($results ?? []);
    }

    /**
     * GET /api/reverse-geocode?lat=&lng=  →  { street, barangay, city, province, matched_by }
     *
     * City and barangay are always names from our address dropdown (barangay_coordinates holds
     * one row per dropdown barangay). Nominatim's barangay name is matched first; otherwise the
     * nearest barangay centre is used ('nearest' = approximate). Works without Nominatim too.
     */
    public function reverse(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);
        $lat = (float) $data['lat'];
        $lng = (float) $data['lng'];

        if (! ServiceArea::contains($lat, $lng)) {
            return response()->json(['message' => ServiceArea::MESSAGE], 422);
        }

        $osm = $this->nominatimReverse($lat, $lng);   // null when Nominatim is unreachable

        // City: only accept one of our Cavite cities
        $cities = BarangayCoordinate::query()->distinct()->pluck('city');
        $city   = null;
        foreach ($osm['cities'] ?? [] as $candidate) {
            $key  = BarangayCoordinate::normalizeCity($candidate);
            $city = $cities->first(fn ($c) => BarangayCoordinate::normalizeCity($c) === $key);
            if ($city) {
                break;
            }
        }

        $barangay  = null;
        $matchedBy = 'nearest';

        if ($city) {
            $rows = BarangayCoordinate::where('city', $city)->get();
            foreach ($osm['barangays'] ?? [] as $candidate) {
                $match = $this->matchBarangay($rows, $candidate, $lat, $lng);
                if ($match) {
                    $barangay  = $match;
                    $matchedBy = 'name';
                    break;
                }
            }
        }

        if (! $barangay) {
            // Nearest barangay centre — inside the city Nominatim gave, else anywhere in Cavite.
            // Longitude is scaled by cos(latitude) (~0.97 in Cavite) so distances are roughly metric.
            $nearest = BarangayCoordinate::query()
                ->when($city, fn ($q) => $q->where('city', $city))
                ->orderByRaw('POW(latitude - ?, 2) + POW((longitude - ?) * 0.97, 2)', [$lat, $lng])
                ->first();
            if ($nearest) {
                $city     = $nearest->city;
                $barangay = $nearest->barangay;
            }
        }

        return response()->json([
            'street'     => $osm['street'] ?? null,
            'barangay'   => $barangay,
            'city'       => $city,
            'province'   => 'Cavite',
            'matched_by' => $matchedBy,
        ]);
    }

    /**
     * Nominatim reverse lookup, cached for 30 days per ~10 m cell.
     * Returns ['street' => ?string, 'barangays' => string[], 'cities' => string[]], or null on failure.
     */
    private function nominatimReverse(float $lat, float $lng): ?array
    {
        $key = sprintf('reverse-geocode:%.4f,%.4f', $lat, $lng);

        return Cache::remember($key, now()->addDays(30), function () use ($lat, $lng) {
            try {
                $this->waitForNominatimSlot();
                $res = Http::withHeaders(['User-Agent' => self::USER_AGENT, 'Accept-Language' => 'en'])
                    ->timeout(5)
                    ->get('https://nominatim.openstreetmap.org/reverse', [
                        'lat'            => $lat,
                        'lon'            => $lng,
                        'format'         => 'jsonv2',
                        'zoom'           => 18,
                        'addressdetails' => 1,
                    ]);
            } catch (\Throwable $e) {
                Log::warning('Nominatim reverse failed', ['lat' => $lat, 'lng' => $lng, 'error' => $e->getMessage()]);
                return null;   // not cached
            }
            if (! $res->ok()) {
                return null;
            }

            $a = $res->json('address') ?? [];

            $road   = trim(implode(' ', array_filter([$a['house_number'] ?? null, $a['road'] ?? null])));
            $extra  = $a['neighbourhood'] ?? $a['subdivision'] ?? null;
            $street = $road !== '' ? ($extra && $extra !== $road ? "{$road}, {$extra}" : $road) : null;

            return [
                'street'    => $street,
                'barangays' => array_values(array_filter([
                    $a['quarter'] ?? null, $a['village'] ?? null, $a['suburb'] ?? null,
                    $a['neighbourhood'] ?? null, $a['city_district'] ?? null,
                ])),
                'cities'    => array_values(array_filter([
                    $a['city'] ?? null, $a['town'] ?? null, $a['municipality'] ?? null,
                ])),
            ];
        });
    }

    /**
     * Our barangay name for a Nominatim name within one city: exact (ignoring "(Poblacion)"-style
     * suffixes), else the base name ("Talaba" → nearest of Talaba I…VII). Null when nothing fits.
     */
    private function matchBarangay($rows, string $candidate, float $lat, float $lng): ?string
    {
        $strip = fn (string $s) => trim(preg_replace('/\s*\(.*?\)\s*/', ' ', BarangayCoordinate::normalize($s)));
        $want  = $strip($candidate);

        $exact = $rows->first(fn ($r) => $strip($r->barangay) === $want);
        if ($exact) {
            return $exact->barangay;
        }

        $base = BarangayCoordinate::baseBarangay($want);
        if ($base === '') {
            return null;
        }
        $same = $rows->filter(fn ($r) => BarangayCoordinate::baseBarangay($strip($r->barangay)) === $base);

        return $same->sortBy(fn ($r) => ($r->latitude - $lat) ** 2 + (($r->longitude - $lng) * 0.97) ** 2)
            ->first()?->barangay;
    }

    /**
     * GET /api/route?points=lat,lng;lat,lng;…  →  { ok, coordinates: [[lat,lng],…], distance_km, duration_min }
     * Points are in Leaflet order (lat,lng); OSRM wants lng,lat, which is converted here.
     */
    public function route(Request $request): JsonResponse
    {
        $points = collect(explode(';', (string) $request->query('points', '')))
            ->map(fn ($p) => array_map('floatval', explode(',', $p)))
            ->filter(fn ($p) => count($p) === 2 && abs($p[0]) <= 90 && abs($p[1]) <= 180 && ($p[0] || $p[1]))
            ->values();

        if ($points->count() < 2 || $points->count() > 25) {
            return response()->json(['ok' => false, 'message' => 'Between 2 and 25 points are required.'], 422);
        }

        // ~10 m rounding so tiny GPS jitter reuses the cached route
        $coordString = $points->map(fn ($p) => sprintf('%.4f,%.4f', $p[1], $p[0]))->implode(';');   // lng,lat!
        $cacheKey    = 'osrm:' . md5($coordString);

        $route = Cache::get($cacheKey);
        if (! $route && ! Cache::has($cacheKey . ':down')) {
            foreach (self::OSRM_SERVERS as $base) {
                try {
                    $res  = Http::withHeaders(['User-Agent' => self::USER_AGENT])->connectTimeout(4)->timeout(8)
                        ->get($base . $coordString, ['overview' => 'full', 'geometries' => 'geojson']);
                    $json = $res->json();
                    if ($res->ok() && ($json['code'] ?? null) === 'Ok' && ! empty($json['routes'][0])) {
                        $r     = $json['routes'][0];
                        $route = [
                            'ok'           => true,
                            'coordinates'  => array_map(fn ($c) => [round($c[1], 6), round($c[0], 6)], $r['geometry']['coordinates']),
                            'distance_km'  => round($r['distance'] / 1000, 2),
                            'duration_min' => (int) round($r['duration'] / 60),
                        ];
                        Cache::put($cacheKey, $route, now()->addDays(7));
                        break;
                    }
                } catch (\Throwable $e) {
                    Log::warning('OSRM routing failed', ['server' => $base, 'error' => $e->getMessage()]);
                }
            }
            if (! $route) {
                // Don't hammer unreachable servers: retry routing for these points after a minute
                Cache::put($cacheKey . ':down', true, now()->addMinute());
            }
        }

        return response()->json($route ?? [
            'ok'      => false,
            'message' => 'Road routing service is unreachable — showing straight lines.',
        ]);
    }

    /** Space Nominatim calls at least 1 s apart across all users (their usage policy). */
    private function waitForNominatimSlot(): void
    {
        Cache::lock('nominatim-slot', 5)->block(5, function () {
            $last = (float) Cache::get('nominatim-last', 0);
            $wait = 1.0 - (microtime(true) - $last);
            if ($wait > 0) {
                usleep((int) ($wait * 1_000_000));
            }
            Cache::put('nominatim-last', microtime(true), 10);
        });
    }
}
