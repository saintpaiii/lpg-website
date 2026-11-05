<?php

namespace App\Services;

use App\Models\CartItem;
use App\Models\Customer;
use App\Models\OrderItem;
use App\Models\Product;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Seller's "Max per customer" limit on a product, per ORDER (the cart line), per DAY (Asia/Manila calendar day)
 * or per WEEK (rolling 7 days).
 *
 * For day/week the customer's earlier orders count: orders they placed themself (created_by = their user id,
 * for their own customer record), not cancelled, not deleted. Seller walk-in orders and refund replacements
 * (created_by = seller/staff) don't count. Unpaid online orders count until orders:cancel-unpaid cancels them.
 */
class PurchaseLimitService
{
    public const PERIODS = ['order', 'day', 'week'];

    /** Start of the counting window; null for 'order' (earlier orders don't count). */
    public static function periodStart(string $period): ?CarbonInterface
    {
        return match ($period) {
            'day'   => now('Asia/Manila')->startOfDay()->setTimezone(config('app.timezone')),
            'week'  => now()->subDays(7),
            default => null,
        };
    }

    public static function period(Product $product): string
    {
        return in_array($product->limit_period, self::PERIODS, true) ? $product->limit_period : 'order';
    }

    /** "Max 5 per day" (null when the product has no limit). */
    public static function label(Product $product): ?string
    {
        return $product->max_per_order !== null ? "Max {$product->max_per_order} per " . self::period($product) : null;
    }

    /** Order items the customer placed themself (any period) — not cancelled, not deleted. */
    private static function countedItems(int $userId): Builder
    {
        // OrderItem uses SoftDeletes (order_items.deleted_at is filtered by the model); orders is joined raw
        return OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.created_by', $userId)
            ->whereIn('orders.customer_id', Customer::select('id')->where('user_id', $userId))
            ->where('orders.status', '!=', 'cancelled')
            ->whereNull('orders.deleted_at');
    }

    public static function boughtInPeriod(int $userId, Product|int $product, string $period): int
    {
        $start = self::periodStart($period);
        if (! $start) {
            return 0;
        }

        return (int) self::countedItems($userId)
            ->where('order_items.product_id', $product instanceof Product ? $product->id : $product)
            ->where('orders.created_at', '>=', $start)
            ->sum('order_items.quantity');
    }

    /**
     * Bought in each product's own period, for many products in ONE query (the widest window, 7 days, split
     * into day/week in SQL). Only products with a day/week limit are queried.
     *
     * @return array<int, array{bought: int, oldest: ?CarbonInterface}>  oldest = oldest counted order (for "per week")
     */
    public static function statsForMany(?int $userId, Collection $products): array
    {
        $limited = $products->filter(fn (Product $p) => $p->max_per_order !== null && self::period($p) !== 'order');
        if (! $userId || $limited->isEmpty()) {
            return [];
        }

        $dayStart  = self::periodStart('day');
        $weekStart = self::periodStart('week');
        $rows = self::countedItems($userId)
            ->whereIn('order_items.product_id', $limited->pluck('id')->unique()->values())
            ->where('orders.created_at', '>=', $weekStart)
            ->groupBy('order_items.product_id')
            ->select('order_items.product_id')
            ->selectRaw('SUM(order_items.quantity) AS week_qty')
            ->selectRaw('SUM(CASE WHEN orders.created_at >= ? THEN order_items.quantity ELSE 0 END) AS day_qty', [$dayStart])
            ->selectRaw('MIN(orders.created_at) AS oldest')
            ->toBase()
            ->get()
            ->keyBy('product_id');

        $out = [];
        foreach ($limited as $p) {
            $r = $rows->get($p->id);
            $week = self::period($p) === 'week';
            $out[$p->id] = [
                'bought' => (int) ($r ? ($week ? $r->week_qty : $r->day_qty) : 0),
                'oldest' => $r && $week ? Carbon::parse($r->oldest) : null,
            ];
        }

        return $out;
    }

    /** @return array<int, int> productId => bought in that product's period (one query) */
    public static function boughtForMany(?int $userId, Collection $products): array
    {
        return array_map(fn ($s) => $s['bought'], self::statsForMany($userId, $products));
    }

    /** How many more the customer may add (null = no limit). */
    public static function remaining(int $userId, Product $product, int $inCart): ?int
    {
        if ($product->max_per_order === null) {
            return null;
        }

        return max(0, $product->max_per_order - $inCart - self::boughtInPeriod($userId, $product, self::period($product)));
    }

    /** "You can buy at most 5 of X per day. You already bought 3 today. You have 1 in your cart. You can add 1 more." */
    public static function message(Product $product, int $bought, int $inCart): string
    {
        $period = self::period($product);
        $left   = max(0, (int) $product->max_per_order - $bought - $inCart);

        return "You can buy at most {$product->max_per_order} of {$product->name} per {$period}."
            . ($bought > 0 ? " You already bought {$bought} " . ($period === 'day' ? 'today' : 'this week') . '.' : '')
            . ($inCart > 0 ? " You have {$inCart} in your cart." : '')
            . ($left > 0 ? " You can add {$left} more." : '');
    }

    /** True when this quantity (one cart line = one order) plus what was bought in the period is over the max. */
    public static function isOver(Product $product, int $quantity, int $bought): bool
    {
        return $product->max_per_order !== null && $quantity + $bought > $product->max_per_order;
    }

    /**
     * Fields for every customer payload that shows a product: limit_period, limit_label and — for a logged-in
     * customer and a product with a limit — in_cart, bought_in_period, limit_remaining (what they can still add)
     * and limit_resets_at (per week, when nothing is left: the day the oldest counted order turns 7 days old).
     * One query for the bought amounts + one for the cart, whatever the number of products.
     *
     * @param  array<int,int>|null  $inCart  productId => quantity in the cart (null = read it here)
     * @return array<int, array>  productId => fields
     */
    public static function payloadForMany(?int $userId, Collection $products, ?array $inCart = null): array
    {
        $limitedIds = $products->filter(fn (Product $p) => $p->max_per_order !== null)->pluck('id')->unique()->values();
        $stats = self::statsForMany($userId, $products);
        if ($userId && $inCart === null && $limitedIds->isNotEmpty()) {
            $inCart = CartItem::where('user_id', $userId)->whereIn('product_id', $limitedIds)->pluck('quantity', 'product_id')->all();
        }

        $out = [];
        foreach ($products as $p) {
            $out[$p->id] = self::fields($p, $userId, $stats[$p->id] ?? null, $inCart);
        }

        return $out;
    }

    /** Same fields for one product (product page). */
    public static function payload(?int $userId, Product $product, ?int $inCart = null): array
    {
        return self::payloadForMany($userId, collect([$product]), $inCart === null ? null : [$product->id => $inCart])[$product->id];
    }

    private static function fields(Product $p, ?int $userId, ?array $stat, ?array $inCart): array
    {
        $base = ['limit_period' => self::period($p), 'limit_label' => self::label($p)];
        if (! $userId || $p->max_per_order === null) {
            return $base + ['bought_in_period' => 0, 'limit_remaining' => null, 'limit_resets_at' => null];
        }

        $bought = $stat['bought'] ?? 0;
        $cart   = (int) ($inCart[$p->id] ?? 0);
        $left   = max(0, $p->max_per_order - $bought - $cart);
        $resets = null;
        if ($left === 0 && $bought > 0 && self::period($p) === 'week' && ($stat['oldest'] ?? null)) {
            $resets = $stat['oldest']->copy()->addDays(7)->format('M j, g:i A');
        }

        return $base + [
            'in_cart'          => $cart,
            'bought_in_period' => $bought,
            'limit_remaining'  => $left,
            'limit_resets_at'  => $resets,
        ];
    }

    /** Lock the customer row for the rest of the transaction (two checkouts at once can't both pass the limit). */
    public static function lockCustomer(int $customerId): void
    {
        DB::table('customers')->where('id', $customerId)->lockForUpdate()->first();
    }
}
