<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use App\Services\ProductMediaService;
use App\Services\SubscriptionService;
use App\Support\LpgSize;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    private function fmt(Product $p): array
    {
        return [
            'id'               => $p->id,
            'name'             => $p->name,
            'brand'            => $p->brand ?? '',
            'weight'           => $p->weight ?? '',
            // Number for the form: weight_kg, or parsed from the old free text
            'weight_kg'        => $p->weight_kg !== null && (float) $p->weight_kg > 0 ? (float) $p->weight_kg : LpgSize::parseKg($p->weight),
            'max_per_order'    => $p->max_per_order,
            'description'      => $p->description,
            'refill_price'     => (float) ($p->refill_price ?? 0),
            'purchase_price'   => (float) ($p->purchase_price ?? 0),
            'selling_price'    => (float) ($p->selling_price ?? 0),
            'is_active'        => $p->is_active,
            'paused_by_plan'   => (bool) $p->paused_by_plan,
            'image_url'        => $p->image ? Storage::url($p->image) : null,
            'media'            => $p->mediaPayload(),
            'stock'            => $p->inventory?->quantity ?? 0,
            'reorder_level'    => $p->inventory?->reorder_level ?? 10,
            'created_at'       => $p->created_at->format('M d, Y'),
            'deleted_at'       => $p->deleted_at?->format('M d, Y'),
            'avg_rating'       => round((float) ($p->ratings_avg_rating ?? 0), 1),
            'review_count'     => (int) ($p->ratings_count ?? 0),
        ];
    }

    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $tab   = $request->input('tab', 'active');
        $search = $request->input('search');

        $query = Product::withTrashed()
            ->where('store_id', $store->id)
            ->with(['inventory', 'media'])
            ->withAvg('ratings', 'rating')
            ->withCount('ratings');

        if ($tab === 'archived') {
            $query->onlyTrashed();
        } elseif ($tab === 'inactive') {
            $query->whereNull('deleted_at')->where('is_active', false);
        } elseif ($tab === 'paused') {
            $query->whereNull('deleted_at')->where('paused_by_plan', true);
        } else {
            $query->whereNull('deleted_at')->where('is_active', true);
        }

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('brand', 'like', "%{$search}%");
            });
        }

        $products = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($p) => $this->fmt($p));

        $counts = [
            'active'   => Product::where('store_id', $store->id)->where('is_active', true)->count(),
            'inactive' => Product::where('store_id', $store->id)->where('is_active', false)->count(),
            'paused'   => Product::where('store_id', $store->id)->where('paused_by_plan', true)->count(),
            'archived' => Product::onlyTrashed()->where('store_id', $store->id)->count(),
        ];

        return Inertia::render('seller/products', [
            'products' => $products,
            'counts'   => $counts,
            'planLimit' => [
                'used'      => $counts['active'],
                'limit'     => SubscriptionService::limits($store)['products'],
                'plan'      => SubscriptionService::summary($store)['last_name'] ?? 'Basic',
                'message'   => SubscriptionService::limitMessage($store, 'products'),
                'can_add'   => SubscriptionService::canAdd($store, 'products'),
            ],
            'tab'      => $tab,
            'search'   => $search ?? '',
            // Largest total upload the server accepts (post_max_size − 1 MB margin) — checked before sending
            'max_upload_bytes' => max(1024 * 1024, self::iniBytes((string) ini_get('post_max_size')) - 1024 * 1024),
        ]);
    }

    /** "64M" → bytes */
    private static function iniBytes(string $value): int
    {
        $value = trim($value);
        $num   = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g'     => $num * 1024 ** 3,
            'm'     => $num * 1024 ** 2,
            'k'     => $num * 1024,
            default => $num ?: 8 * 1024 ** 2,
        };
    }

    /** Fields shared by create + edit. Tank size is a number in kg; refill can't cost more than a new tank. */
    private static function productRules(): array
    {
        return [
            'name'           => 'required|string|max:255',
            'brand'          => 'nullable|string|max:100',
            'weight_kg'      => 'required|numeric|min:0.5|max:100',
            'description'    => 'nullable|string|max:1000',
            'refill_price'   => 'required|numeric|min:0|lte:purchase_price',
            'purchase_price' => 'required|numeric|min:1',
            'max_per_order'  => 'nullable|integer|min:1|max:999',
            'reorder_level'  => 'required|integer|min:0',
        ];
    }

    private static function productMessages(): array
    {
        $size = 'Enter the tank size in kg, e.g. 11.';

        return [
            ...ProductMediaService::messages(),
            'weight_kg.required' => $size,
            'weight_kg.numeric'  => $size,
            'weight_kg.min'      => $size,
            'weight_kg.max'      => $size,
            'refill_price.lte'   => "Refill price can't be higher than the new tank price.",
        ];
    }

    /** weight_kg (1 decimal) + the "11 kg" text that older pages still read. */
    private static function sizeAttributes(array $data): array
    {
        $kg = round((float) $data['weight_kg'], 1);

        return ['weight_kg' => $kg, 'weight' => LpgSize::label($kg)];
    }

    public function store(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        $data = $request->validate([
            ...self::productRules(),
            'stock'          => 'required|integer|min:0',
            ...ProductMediaService::rules(),
        ], self::productMessages());

        // Plan limit reached → still saved, but unpublished
        $publish = SubscriptionService::canAdd($store, 'products');

        // Product, stock and photos/video together: a media problem leaves nothing half-saved
        $product = \Illuminate\Support\Facades\DB::transaction(function () use ($store, $data, $request, $publish) {
            $product = Product::create([
                'store_id'       => $store->id,
                'name'           => $data['name'],
                'brand'          => $data['brand'] ?? null,
                ...self::sizeAttributes($data),
                'max_per_order'  => $data['max_per_order'] ?? null,
                'description'    => $data['description'] ?? null,
                'refill_price'   => $data['refill_price'],
                'purchase_price' => $data['purchase_price'],
                'selling_price'  => $data['purchase_price'],
                'cost_price'     => $data['purchase_price'],
                'is_active'      => $publish,
                'image'          => null,   // set from the first photo by the media sync
            ]);

            Inventory::create([
                'product_id'    => $product->id,
                'quantity'      => $data['stock'],
                'reorder_level' => $data['reorder_level'],
            ]);

            ProductMediaService::sync($product, $request);

            return $product;
        });

        if (! $publish) {
            return redirect()->route('seller.products', ['tab' => 'inactive'])
                ->with('warning', 'Saved as unpublished — ' . SubscriptionService::limitMessage($store, 'products'));
        }

        return redirect()->route('seller.products')->with('success', "Product \"{$product->name}\" created.");
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

        if ($product->store_id !== $store->id) {
            abort(403);
        }

        $data = $request->validate([
            ...self::productRules(),
            ...ProductMediaService::rules(),
        ], self::productMessages());

        // Photos + video first (validated cross-field; files are cleaned up if anything fails)
        ProductMediaService::sync($product, $request);

        $updates = [
            'name'           => $data['name'],
            'brand'          => $data['brand'] ?? null,
            ...self::sizeAttributes($data),
            'max_per_order'  => $data['max_per_order'] ?? null,
            'description'    => $data['description'] ?? null,
            'refill_price'   => $data['refill_price'],
            'purchase_price' => $data['purchase_price'],
        ];

        $product->update($updates);

        if ($product->inventory) {
            $product->inventory->update(['reorder_level' => $data['reorder_level']]);
        }

        return redirect()->route('seller.products')->with('success', "Product \"{$product->name}\" updated.");
    }

    public function toggle(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        // Publishing counts against the plan; unpublishing always works
        if (! $product->is_active && ! SubscriptionService::canAdd($store, 'products')) {
            return back()->with('error', SubscriptionService::limitMessage($store, 'products'));
        }

        $product->update(['is_active' => ! $product->is_active, 'paused_by_plan' => false]);
        $state = $product->is_active ? 'activated' : 'deactivated';

        return back()->with('success', "Product \"{$product->name}\" {$state}.");
    }

    public function destroy(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $product->delete();
        return back()->with('success', "Product \"{$product->name}\" archived.");
    }

    public function restore(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $product->restore();

        // Restored as published but the store is over its plan limit → unpublished (kept)
        if ($product->is_active) {
            $limit = SubscriptionService::limits($store)['products'];
            if ($limit !== null && SubscriptionService::usage($store)['products'] > $limit) {
                $product->update(['is_active' => false, 'paused_by_plan' => true]);

                return back()->with('warning', "Product \"{$product->name}\" restored as unpublished — " . SubscriptionService::limitMessage($store, 'products'));
            }
        }

        return back()->with('success', "Product \"{$product->name}\" restored.");
    }

    public function forceDestroy(Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        // Permanent delete: remove every photo, video and poster (archiving keeps them)
        ProductMediaService::deleteFiles($product);

        $name = $product->name;
        $product->forceDelete();
        return back()->with('success', "Product \"{$name}\" permanently deleted.");
    }
}
