<?php

namespace App\Services;

use App\Models\Store;
use App\Support\StoreDocuments;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Finds stores that look like the same business. Most matches are only WARNINGS (seller + admin);
 * a TRUE duplicate is blocked:
 *   - same name AND (pin within 50 m OR same address), or
 *   - a required document file already used by another store (same SHA-256).
 * Compared against pending, approved and suspended stores (not rejected, not soft-deleted), never the caller's own.
 */
class DuplicateStoreService
{
    public const NEAR_METERS = 50;
    public const STATUSES    = ['pending', 'approved', 'suspended'];

    /** Whole words dropped before comparing names ("Juan LPG Gas Store" = "Juan") */
    private const FILLERS = ['lpg', 'gas', 'store', 'trading', 'shop', 'center', 'centre', 'and'];

    /** Required documents whose files are hashed (valid_id excluded) */
    public static function hashedTypes(): array
    {
        return array_keys(StoreDocuments::TYPES);
    }

    public static function normalizeName(?string $name): string
    {
        $words = preg_split('/\s+/', trim(preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower((string) $name))), -1, PREG_SPLIT_NO_EMPTY);

        return implode('', array_diff($words, self::FILLERS));
    }

    public static function normalizeAddress(?string $address, ?string $barangay, ?string $city): string
    {
        $s = mb_strtolower(implode(' ', [$address, $barangay, $city]));
        $s = preg_replace('/\b(brgy|bgy|barangay)\b\.?/', ' ', $s);

        return preg_replace('/[^a-z0-9]+/', '', $s);
    }

    public static function normalizePhone(?string $phone): string
    {
        $d = preg_replace('/\D+/', '', (string) $phone);
        if (str_starts_with($d, '63') && strlen($d) === 12) {
            $d = '0' . substr($d, 2);
        }

        return $d;
    }

    public static function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($a)));
    }

    /** SHA-256 of each uploaded required document in the request (valid_id excluded). */
    public static function hashUploads(Request $request): array
    {
        $out = [];
        foreach (self::hashedTypes() as $type) {
            if ($request->hasFile($type) && ($p = $request->file($type)->getRealPath())) {
                $out[$type] = hash_file('sha256', $p);
            }
        }

        return $out;
    }

    /** SHA-256 of a stored file on the local disk, or null when it's missing. */
    public static function hashStored(?string $path): ?string
    {
        if (! $path) {
            return null;
        }
        $disk = \Illuminate\Support\Facades\Storage::disk('local');

        return $disk->exists($path) ? hash_file('sha256', $disk->path($path)) : null;
    }

    /**
     * @param array{store_name?:?string,address?:?string,barangay?:?string,city?:?string,latitude?:mixed,longitude?:mixed,phones?:array,hashes?:array} $input
     * @return array{matches: list<array{store_id:int,store_name:string,city:?string,status:string,fields:list<string>,distance_m:?int}>, block: ?array{field:string,message:string}, near: bool, same_name: bool}
     */
    public static function check(array $input, ?int $ignoreStoreId = null): array
    {
        $name    = static::normalizeName($input['store_name'] ?? null);
        $address = static::normalizeAddress($input['address'] ?? null, $input['barangay'] ?? null, $input['city'] ?? null);
        $lat     = isset($input['latitude']) && $input['latitude'] !== '' ? (float) $input['latitude'] : null;
        $lng     = isset($input['longitude']) && $input['longitude'] !== '' ? (float) $input['longitude'] : null;
        $phones  = array_values(array_filter(array_map([static::class, 'normalizePhone'], $input['phones'] ?? [])));
        $hashes  = array_filter($input['hashes'] ?? []);

        $matches = [];
        $block   = null;

        static::candidates($ignoreStoreId)->each(function (Store $s) use ($name, $address, $lat, $lng, $phones, $hashes, &$matches, &$block) {
            $fields = [];
            $dist   = null;

            if ($name !== '' && static::normalizeName($s->store_name) === $name) {
                $fields[] = 'same_name';
            }
            if ($lat !== null && $lng !== null && $s->latitude !== null && $s->longitude !== null) {
                $dist = static::distanceMeters($lat, $lng, (float) $s->latitude, (float) $s->longitude);
                if ($dist <= self::NEAR_METERS) {
                    $fields[] = 'near_location';
                }
            }
            if ($address !== '' && static::normalizeAddress($s->address, $s->barangay, $s->city) === $address) {
                $fields[] = 'same_address';
            }
            $theirPhones = array_filter([static::normalizePhone($s->phone), static::normalizePhone($s->owner?->phone)]);
            if ($phones && array_intersect($phones, $theirPhones)) {
                $fields[] = 'same_phone';
            }
            $sameDocs = [];
            foreach ((array) ($s->document_hashes ?? []) as $type => $h) {
                foreach ($hashes as $myType => $mine) {
                    if ($h && hash_equals((string) $h, (string) $mine)) {
                        $sameDocs[$myType] = true;
                    }
                }
            }
            if ($sameDocs) {
                $fields[] = 'same_files';
            }

            if (! $fields) {
                return;
            }

            $matches[] = [
                'store_id'   => $s->id,
                'store_name' => $s->store_name,
                'city'       => $s->city,
                'status'     => $s->status,
                'fields'     => $fields,
                'documents'  => array_map(fn ($t) => StoreDocuments::label($t), array_keys($sameDocs)),
                'distance_m' => $dist !== null && $dist <= 1000 ? (int) round($dist) : null,
            ];

            if ($block === null && $sameDocs) {
                $type  = array_key_first($sameDocs);
                $block = ['field' => $type, 'message' => 'This ' . StoreDocuments::label($type) . ' was already submitted by another store — upload your own document.'];
            }
            if ($block === null && in_array('same_name', $fields, true)
                && (in_array('near_location', $fields, true) || in_array('same_address', $fields, true))) {
                $block = ['field' => 'store_name', 'message' => "A store named '{$s->store_name}' is already registered at this location."];
            }
        });

        $has = fn (string $f) => (bool) array_filter($matches, fn ($m) => in_array($f, $m['fields'], true));

        return ['matches' => $matches, 'block' => $block, 'near' => $has('near_location'), 'same_name' => $has('same_name')];
    }

    /** For stores.duplicate_flags (null when nothing matched). */
    public static function flags(array $result): ?array
    {
        return $result['matches'] ? ['checked_at' => now()->toIso8601String(), 'matches' => $result['matches']] : null;
    }

    /** The seller's "check the name while typing": only {exists, count, cities} — never owners or phones. */
    public static function nameSummary(string $storeName, ?int $ignoreStoreId = null): array
    {
        $name = static::normalizeName($storeName);
        if ($name === '') {
            return ['exists' => false, 'count' => 0, 'cities' => []];
        }
        $same = static::candidates($ignoreStoreId, withOwner: false)->filter(fn (Store $s) => static::normalizeName($s->store_name) === $name);

        return [
            'exists' => $same->isNotEmpty(),
            'count'  => $same->count(),
            'cities' => $same->pluck('city')->filter()->unique()->values()->take(5)->all(),
        ];
    }

    /** Seller-facing warnings (not blocking) after a successful submit. */
    public static function sellerWarning(array $result): ?string
    {
        $msgs = [];
        if ($result['same_name']) {
            $msgs[] = 'Another store already uses this name — make sure your address and documents are your own.';
        }
        if ($result['near']) {
            $msgs[] = 'Another store is pinned within ' . self::NEAR_METERS . ' m of yours.';
        }

        return $msgs ? implode(' ', $msgs) : null;
    }

    /** @return Collection<int, Store> */
    private static function candidates(?int $ignoreStoreId, bool $withOwner = true): Collection
    {
        return Store::query()
            ->when($withOwner, fn ($q) => $q->with('owner:id,phone'))
            ->whereIn('status', self::STATUSES)
            ->when($ignoreStoreId, fn ($q) => $q->where('id', '!=', $ignoreStoreId))
            ->get(['id', 'user_id', 'store_name', 'address', 'barangay', 'city', 'phone', 'latitude', 'longitude', 'status', 'document_hashes']);
    }
}
