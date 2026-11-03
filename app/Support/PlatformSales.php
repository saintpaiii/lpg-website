<?php

namespace App\Support;

use App\Models\Order;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Platform sales (GMV): what customers paid stores for delivered orders — items + delivery fee.
 * A sale is dated by delivered_at (created_at for old orders without one).
 */
class PlatformSales
{
    public const SALE_DATE = 'COALESCE(orders.delivered_at, orders.created_at)';

    /** Delivered orders, optionally within [from, to] by sale date. */
    public static function query(?CarbonInterface $from = null, ?CarbonInterface $to = null): Builder
    {
        return Order::query()
            ->where('orders.status', 'delivered')
            ->when($from, fn ($q) => $q->where(DB::raw(self::SALE_DATE), '>=', $from))
            ->when($to, fn ($q) => $q->where(DB::raw(self::SALE_DATE), '<=', $to));
    }

    /** Sum of items + delivery fee for a delivered-orders query. */
    public static function gmv(Builder $query): float
    {
        return round((float) (clone $query)->sum(DB::raw('orders.total_amount + COALESCE(orders.shipping_fee, 0)')), 2);
    }

    public static function between(?CarbonInterface $from = null, ?CarbonInterface $to = null): float
    {
        return static::gmv(static::query($from, $to));
    }
}
