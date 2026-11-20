<?php

namespace App\Services;

use App\Models\Order;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * K9 — the ONE definition of "sales" (seller Dashboard, Revenue, Reports, DSS overview, the Main dashboard, the admin
 * store page): what the customer paid for DELIVERED and PAID orders — items + the delivery fee (= Order::grandTotal(),
 * the receipt / invoice total). A sale counts on the day it was delivered (orders created before delivered_at was
 * recorded count on their created day). "Of which delivery fees" is available separately.
 */
class RevenueService
{
    /** The day a sale counts */
    public const SALE_DATE = 'COALESCE(orders.delivered_at, orders.created_at)';

    /** What the customer paid: items + delivery fee */
    public const AMOUNT = '(orders.total_amount + COALESCE(orders.shipping_fee, 0))';

    /** Delivered + paid orders of these stores (optionally sold between $from and $to, inclusive). */
    public static function query(int|array $storeIds, ?CarbonInterface $from = null, ?CarbonInterface $to = null): Builder
    {
        return Order::query()->whereIn('orders.store_id', (array) $storeIds)
            ->where('orders.status', 'delivered')->where('orders.payment_status', 'paid')
            ->when($from, fn ($q) => $q->where(DB::raw(self::SALE_DATE), '>=', $from->toDateTimeString()))
            ->when($to, fn ($q) => $q->where(DB::raw(self::SALE_DATE), '<=', $to->toDateTimeString()));
    }

    /** Total sales (items + delivery fee). */
    public static function salesFor(int|array $storeIds, ?CarbonInterface $from = null, ?CarbonInterface $to = null): float
    {
        return round((float) static::query($storeIds, $from, $to)->sum(DB::raw(self::AMOUNT)), 2);
    }

    /**
     * Sales, delivery fees and the number of sales — one query.
     *
     * @return array{sales: float, delivery_fees: float, orders: int}
     */
    public static function summary(int|array $storeIds, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        $r = static::query($storeIds, $from, $to)
            ->selectRaw('COALESCE(SUM(' . self::AMOUNT . '), 0) AS s, COALESCE(SUM(COALESCE(orders.shipping_fee, 0)), 0) AS f, COUNT(*) AS n')->first();

        return ['sales' => round((float) $r->s, 2), 'delivery_fees' => round((float) $r->f, 2), 'orders' => (int) $r->n];
    }

    /** Per store: store_id → {sales, delivery_fees, orders}. */
    public static function byStore(array $storeIds, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        return static::query($storeIds, $from, $to)->groupBy('orders.store_id')
            ->selectRaw('orders.store_id AS sid, SUM(' . self::AMOUNT . ') AS s, SUM(COALESCE(orders.shipping_fee, 0)) AS f, COUNT(*) AS n')->get()
            ->mapWithKeys(fn ($r) => [(int) $r->sid => ['sales' => round((float) $r->s, 2), 'delivery_fees' => round((float) $r->f, 2), 'orders' => (int) $r->n]])
            ->all();
    }

    /**
     * Per day (Y-m-d) and store: "Y-m-d" → [store_id → sales].
     *
     * @return array<string, array<int, float>>
     */
    public static function byDay(int|array $storeIds, CarbonInterface $from, CarbonInterface $to): array
    {
        $out = [];
        foreach (static::query($storeIds, $from, $to)->groupBy('orders.store_id', DB::raw('DATE(' . self::SALE_DATE . ')'))
            ->selectRaw('orders.store_id AS sid, DATE(' . self::SALE_DATE . ') AS d, SUM(' . self::AMOUNT . ') AS s')->get() as $r) {
            $out[substr((string) $r->d, 0, 10)][(int) $r->sid] = round((float) $r->s, 2);
        }

        return $out;
    }

    /**
     * K11 — per day for ONE store: "Y-m-d" → {sales, orders}. orders = the number of delivered + paid orders (the
     * same definition as the sales), so revenue ÷ orders is a real average order value.
     *
     * @return array<string, array{sales: float, orders: int}>
     */
    public static function dailyFor(int $storeId, CarbonInterface $from, CarbonInterface $to): array
    {
        $out = [];
        foreach (static::query($storeId, $from, $to)->groupBy(DB::raw('DATE(' . self::SALE_DATE . ')'))
            ->selectRaw('DATE(' . self::SALE_DATE . ') AS d, SUM(' . self::AMOUNT . ') AS s, COUNT(*) AS n')->get() as $r) {
            $out[substr((string) $r->d, 0, 10)] = ['sales' => round((float) $r->s, 2), 'orders' => (int) $r->n];
        }

        return $out;
    }
}
