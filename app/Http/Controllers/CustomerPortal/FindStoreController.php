<?php

namespace App\Http\Controllers\CustomerPortal;

use App\Rules\InServiceArea;
use App\Http\Controllers\BarangayCoordinateController;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Rating;
use App\Models\Store;
use App\Services\DeliveryFeeService;
use App\Services\DeliveryRouteService;
use App\Support\LpgSize;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Find a Store — rule-based store ranking for a customer's LPG request.
 *
 * Filter: approved store, delivers within its range, has stock, sells this size/type.
 * Rank: nearest first (ties by lowest total), or cheapest first (ties by shortest distance).
 * Total = price × quantity + the store's delivery fee for this distance — the same formula used at checkout.
 *
 * Ratings are shown for information only and never affect the order.
 */
class FindStoreController extends Controller
{
    /** stores.max_delivery_radius_km NULL means this (the seller settings default). */
    private const DEFAULT_RADIUS_KM = 20;

    private const MAX_RESULTS = 20;

    public function index(Request $request): Response
    {
        $userId   = $request->user()->id;
        $customer = Customer::where('user_id', $userId)->first();

        // Same source as checkout: saved addresses (the profile address becomes "Home" on first use)
        AddressController::ensureDefaultFromProfile($userId, $customer);
        $addresses = collect(AddressController::listFor($userId))
            ->filter(fn ($a) => $a['latitude'] !== null && $a['longitude'] !== null)
            ->map(fn ($a) => [
                'id'         => $a['id'],
                'label'      => $a['label'],
                'full_text'  => $a['full_text'],
                'lat'        => (float) $a['latitude'],
                'lng'        => (float) $a['longitude'],
                'is_default' => (bool) $a['is_default'],
            ])->values();

        // Default location: the default address, else the first address, else the profile barangay
        $default = $addresses->first();
        $defaultLocation = $default
            ? ['label' => $default['full_text'], 'lat' => $default['lat'], 'lng' => $default['lng'], 'address_id' => $default['id']]
            : null;
        if (! $defaultLocation && $customer && ($at = BarangayCoordinateController::addressPoint($customer->city, $customer->barangay))) {
            $defaultLocation = [
                'label'      => collect([$customer->address, $customer->barangay, $customer->city])->filter()->implode(', '),
                'lat'        => (float) $at[0],
                'lng'        => (float) $at[1],
                'address_id' => null,
            ];
        }

        return Inertia::render('customer/find-store', [
            'sizes'            => $this->sizes()->map(fn ($s) => ['kg' => $s['kg'], 'label' => $s['label']])->values(),
            'brands'           => $this->brands(),
            'addresses'        => $addresses,
            'default_location' => $defaultLocation,
            'initial'          => [
                // From Browse (?weight=11kg) or a saved search (?size_kg=11 / ?custom_kg=15)
                'size_kg'   => $request->query('size_kg') ?? LpgSize::parseKg($request->query('weight')),
                'custom_kg' => $request->query('custom_kg'),
                'brand'    => $request->query('brand'),
                'type'     => $request->query('type'),
                'quantity' => $request->query('quantity'),
            ],
        ]);
    }

    public function results(Request $request): JsonResponse
    {
        $data = $request->validate([
            'size_kg'   => ['nullable', 'numeric', 'required_without_all:custom_kg,weight'],
            'custom_kg' => ['nullable', 'numeric', 'min:0.5', 'max:100'],
            'weight'    => ['nullable', 'string', 'max:50'],   // old links (e.g. "11kg")
            'brand'    => ['nullable', 'string', 'max:100'],
            'type'     => ['required', 'in:refill,new_purchase'],
            'quantity' => ['required', 'integer', 'min:1', 'max:20'],
            'lat'      => ['required', 'numeric', 'between:-90,90', new InServiceArea('lng')],
            'lng'      => ['required', 'numeric', 'between:-180,180'],
            'sort'     => ['nullable', 'in:nearest,cheapest'],
        ]);
        $sort = $data['sort'] ?? 'nearest';
        $qty  = (int) $data['quantity'];
        $lat  = (float) $data['lat'];
        $lng  = (float) $data['lng'];

        // Size: the chosen size, else the typed size, else an old ?weight= string
        $requested = isset($data['size_kg']) ? (float) $data['size_kg']
            : (isset($data['custom_kg']) ? (float) $data['custom_kg'] : LpgSize::parseKg($data['weight'] ?? null));
        if ($requested === null) {
            throw ValidationException::withMessages(['size_kg' => 'Choose a size.']);
        }
        $requested = round($requested, 1);

        // Exact size when sold (within 0.05 kg); otherwise the closest size(s) — both when equally close
        $sizes = $this->sizes();
        $used  = $sizes->filter(fn ($s) => abs($s['kg'] - $requested) < 0.05);
        if ($used->isEmpty() && $sizes->isNotEmpty()) {
            $minDiff = $sizes->min(fn ($s) => round(abs($s['kg'] - $requested), 2));
            $used    = $sizes->filter(fn ($s) => round(abs($s['kg'] - $requested), 2) == $minDiff);
        }
        $exact   = $used->isNotEmpty() && abs($used->first()['kg'] - $requested) < 0.05;
        $message = null;
        if (! $exact && $used->isNotEmpty()) {
            $labels  = $used->pluck('label')->all();
            $message = 'No ' . LpgSize::label($requested) . ' tanks are available. Showing the closest '
                . (count($labels) > 1 ? 'sizes: ' . implode(' and ', $labels) : 'size: ' . $labels[0]) . '.';
        }
        $rawWeights = $used->pluck('raw')->flatten()->all();

        $ownStoreId = Store::where('user_id', $request->user()->id)->value('id');

        // 1. Candidate products (one query, store + inventory eager-loaded)
        $products = Product::with(['store', 'inventory'])
            ->where('is_active', true)
            ->whereIn('products.weight', $rawWeights ?: ['__none__'])
            ->when($data['brand'] ?? null, fn ($q, $brand) => $q->where('brand', $brand))
            ->whereNotNull('refill_price')
            ->whereHas('store', fn ($q) => $q->visibleToCustomers())
            ->whereHas('inventory', fn ($q) => $q->where('quantity', '>=', $qty))
            ->when($ownStoreId, fn ($q) => $q->where('store_id', '!=', $ownStoreId))
            ->get();

        // 2–4. Distance, range, fee and total; keep each store's lowest total
        $best = [];
        foreach ($products as $p) {
            $store = $p->store;
            // Price charged at checkout
            $unit = $data['type'] === 'refill'
                ? (float) $p->refill_price
                : (float) ($p->purchase_price ?? $p->refill_price);
            if ($unit <= 0) {
                continue;
            }

            $loc = DeliveryRouteService::storeLocation($store);
            if (! $loc) {
                continue;
            }
            $distance = DeliveryFeeService::distanceKm($loc['lat'], $loc['lng'], $lat, $lng);
            if ($distance > (float) ($store->max_delivery_radius_km ?? self::DEFAULT_RADIUS_KM)) {
                continue;
            }

            // Delivery fee exactly as checkout: distance-based only from the store's own pin, else flat
            $fee = ($store->latitude && $store->longitude)
                ? DeliveryFeeService::fee($store, DeliveryFeeService::distanceKm((float) $store->latitude, (float) $store->longitude, $lat, $lng))
                : (float) ($store->delivery_fee ?? 0);

            $subtotal = $unit * $qty;
            $total    = round($subtotal + $fee, 2);

            if (isset($best[$store->id]) && $best[$store->id]['total'] <= $total) {
                continue;
            }
            $best[$store->id] = compact('p', 'store', 'loc', 'distance', 'fee', 'unit', 'subtotal', 'total');
        }

        // 5. Sort
        $rows = collect($best)->values();
        $byNearest  = fn ($a, $b) => [$a['distance'], $a['total'], $a['store']->store_name] <=> [$b['distance'], $b['total'], $b['store']->store_name];
        $byCheapest = fn ($a, $b) => [$a['total'], $a['distance'], $a['store']->store_name] <=> [$b['total'], $b['distance'], $b['store']->store_name];
        $rows = $rows->sort($sort === 'cheapest' ? $byCheapest : $byNearest)->values();

        // 6. Badges (ties: the first in the sorted list wins)
        $nearestId = $cheapestId = null;
        if ($rows->isNotEmpty()) {
            $minDist  = $rows->min('distance');
            $minTotal = $rows->min('total');
            $nearestId  = $rows->first(fn ($r) => $r['distance'] == $minDist)['store']->id;
            $cheapestId = $rows->first(fn ($r) => $r['total'] == $minTotal)['store']->id;
        }

        $rows = $rows->take(self::MAX_RESULTS);

        // Ratings: one grouped query, display only
        $ratings = Rating::whereIn('store_id', $rows->pluck('store.id'))
            ->selectRaw('store_id, AVG(rating) as avg_rating, COUNT(*) as rating_count')
            ->groupBy('store_id')
            ->get()->keyBy('store_id');

        return response()->json([
            'results' => $rows->map(fn ($r) => $this->present($r, $data['type'], $qty, $ratings, $nearestId, $cheapestId))->values(),
            'summary' => [
                'count'             => $rows->count(),
                'nearest_store_id'  => $nearestId,
                'cheapest_store_id' => $cheapestId,
                'sort'              => $sort,
                'requested_kg'      => $requested,
                'used_kgs'          => $used->pluck('kg')->values(),
                'exact'             => $exact,
                'message'           => $message,
            ],
        ]);
    }

    private function present(array $r, string $type, int $qty, Collection $ratings, ?int $nearestId, ?int $cheapestId): array
    {
        $store  = $r['store'];
        $p      = $r['p'];
        $rating = $ratings->get($store->id);

        return [
            'store' => [
                'id'                   => $store->id,
                'name'                 => $store->store_name,
                'logo_url'             => $store->logo ? Storage::url($store->logo) : null,
                'area'                 => collect([$store->barangay, $store->city])->filter()->implode(', '),
                'approximate_location' => (bool) $r['loc']['approximate'],
                'lat'                  => $r['loc']['lat'],
                'lng'                  => $r['loc']['lng'],
            ],
            'product' => [
                'id'        => $p->id,
                'name'      => $p->name,
                'brand'     => $p->brand,
                'weight'    => $p->weight,
                'size_label' => ($kg = LpgSize::parseKg($p->weight)) !== null ? LpgSize::label($kg) : $p->weight,
                'image_url' => $p->image ? Storage::url($p->image) : null,
            ],
            'type'         => $type,
            'quantity'     => $qty,
            'unit_price'   => round($r['unit'], 2),
            'subtotal'     => round($r['subtotal'], 2),
            'delivery_fee' => round($r['fee'], 2),
            'total'        => $r['total'],
            'distance_km'  => round($r['distance'], 1),
            'stock_left'   => (int) ($p->inventory?->quantity ?? 0),
            'avg_rating'   => $rating ? round((float) $rating->avg_rating, 1) : null,
            'rating_count' => (int) ($rating->rating_count ?? 0),
            'badges'       => array_values(array_filter([
                $store->id === $nearestId ? 'Nearest' : null,
                $store->id === $cheapestId ? 'Cheapest' : null,
            ])),
            'allows_cod'   => (bool) $store->allow_cod,
        ];
    }

    /**
     * Sizes from the same products Browse lists (active, visible stores), grouped by kg so "11kg" and "11 kg"
     * are one size, smallest first: [{kg, label, raw: [weight strings]}].
     */
    private function sizes(): Collection
    {
        // Memoized on the current request (not the controller, which may be reused across requests)
        $attrs = request()->attributes;
        if (! $attrs->has('find_store_sizes')) {
            $attrs->set('find_store_sizes', LpgSize::group(Product::where('is_active', true)
                ->whereHas('store', fn ($q) => $q->visibleToCustomers())
                ->distinct()->whereNotNull('weight')->pluck('weight')));
        }

        return $attrs->get('find_store_sizes');
    }

    /** Same brand list as Browse. */
    private function brands(): Collection
    {
        return Product::where('is_active', true)
            ->whereHas('store', fn ($q) => $q->visibleToCustomers())
            ->distinct()->orderBy('brand')->whereNotNull('brand')->pluck('brand');
    }
}
