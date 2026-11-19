<?php

namespace App\Services;

use App\Models\Store;
use App\Models\User;
use App\Support\StoreContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * J9 — the owner's MAIN dashboard: totals across all approved stores (main + branches), a comparison table per store,
 * charts and rule-based DSS notes. Every number is ONE grouped SQL query over the owner's store ids (GROUP BY store_id),
 * never per store. Cached per owner for 5 minutes (the key changes with a new order / stock move).
 *
 *  sales          = RevenueService (K9: what customers paid — items + delivery fee — for DELIVERED + PAID orders,
 *                   by delivery date): the same number as the seller Dashboard, Revenue, Reports and the receipts
 *  cancel rate    = cancelled ÷ all orders created in the period
 *  delivery time  = average minutes from assigned to delivered (deliveries delivered in the period)
 *  stock value    = Σ usable filled stock × unit cost (K9: the product's cost price, else the latest received PO
 *                   unit cost, else the selling price — those are counted and labelled; expired batches never count)
 *  low stock      = active products whose usable stock ≤ their reorder level
 */
class MainDashboardService
{
    public const PERIODS = ['today' => 'Today', '7d' => 'Last 7 days', '30d' => 'Last 30 days', 'month' => 'This month', 'custom' => 'Custom'];

    /** DSS thresholds (explained on the page) */
    public const CANCEL_RATE = 10.0;      // % — a store at / above this gets "Check …"
    public const SLOW_FACTOR = 1.5;       // × the average delivery time
    public const PLAN_DAYS   = 7;         // a plan ending within this many days → "Renew …"
    public const MIN_ORDERS  = 5;         // fewer orders → no cancel-rate note (too few to say)

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: string} [from 00:00, to 23:59:59, key] */
    public static function period(string $key, ?string $from = null, ?string $to = null): array
    {
        $today = CarbonImmutable::now('Asia/Manila')->startOfDay();
        [$a, $b] = match ($key) {
            'today'  => [$today, $today],
            '7d'     => [$today->subDays(6), $today],
            'month'  => [$today->startOfMonth(), $today],
            'custom' => [CarbonImmutable::parse($from ?: $today->subDays(29)->toDateString(), 'Asia/Manila')->startOfDay(),
                CarbonImmutable::parse($to ?: $today->toDateString(), 'Asia/Manila')->startOfDay()],
            default  => [$today->subDays(29), $today],
        };
        if ($b->lt($a)) {
            [$a, $b] = [$b, $a];
        }
        if ($a->diffInDays($b) > 366) {
            $a = $b->subDays(366);
        }

        return [$a, $b->endOfDay(), array_key_exists($key, self::PERIODS) ? $key : '30d'];
    }

    public static function build(User $owner, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $stores = StoreContext::approvedStores($owner);
        $ids = $stores->pluck('id')->map(fn ($v) => (int) $v)->all();
        if (! $ids) {
            return ['stores' => [], 'rows' => [], 'totals' => null, 'charts' => ['sales' => [], 'orders' => []], 'notes' => [], 'suggestions' => []];
        }
        // The cache key changes with any order / delivery / stock change of these stores (3 cheap MAX queries)
        $version = md5(implode('|', [
            implode(',', $ids),
            (string) DB::table('orders')->whereIn('store_id', $ids)->max('updated_at'),
            (string) DB::table('deliveries')->whereIn('store_id', $ids)->max('updated_at'),
            (string) DB::table('inventories')->join('products', 'products.id', '=', 'inventories.product_id')->whereIn('products.store_id', $ids)->max('inventories.updated_at'),
            (string) DB::table('stock_transfers')->where('owner_id', $owner->id)->max('updated_at'),
        ]));
        $key = "main-dash:{$owner->id}:{$from->toDateString()}:{$to->toDateString()}:{$version}";

        return Cache::remember($key, now()->addMinutes(5), fn () => static::compute($stores, $ids, $from, $to));
    }

    private static function compute($stores, array $ids, CarbonImmutable $from, CarbonImmutable $to): array
    {
        // The app (and the DB timestamps) run on Asia/Manila time (config app.timezone)
        $f = $from->toDateTimeString();
        $t = $to->toDateTimeString();
        $len = $from->diffInDays($to->startOfDay()) + 1;
        $pf = $from->subDays($len)->toDateTimeString();      // previous period of the same length
        $pt = $from->subSecond()->toDateTimeString();

        // 1. Orders by store + status (period)
        $byStatus = DB::table('orders')->whereIn('store_id', $ids)->whereNull('deleted_at')->whereBetween('created_at', [$f, $t])
            ->groupBy('store_id', 'status')->selectRaw('store_id, status, COUNT(*) AS n')->get();
        // 2. Sales (K9: RevenueService — items + delivery fee, delivered + paid, by delivery date): this period and the previous one
        $salesCur = RevenueService::byStore($ids, $from, $to);
        $salesPrev = RevenueService::byStore($ids, CarbonImmutable::parse($pf), CarbonImmutable::parse($pt));
        // 3. Daily sales + orders per store (charts)
        $salesByDay = RevenueService::byDay($ids, $from, $to);
        $daily = DB::table('orders')->whereIn('store_id', $ids)->whereNull('deleted_at')->whereBetween('created_at', [$f, $t])
            ->groupBy('store_id', DB::raw('DATE(created_at)'))
            ->selectRaw('store_id, DATE(created_at) AS d, COUNT(*) AS n')->get();
        // 4. Delivery time (assigned → delivered)
        $deliv = DB::table('deliveries')->whereIn('store_id', $ids)->whereNull('deleted_at')->where('status', 'delivered')
            ->whereNotNull('assigned_at')->whereBetween('delivered_at', [$f, $t])->groupBy('store_id')
            ->selectRaw('store_id, AVG(TIMESTAMPDIFF(MINUTE, assigned_at, delivered_at)) AS m, COUNT(*) AS n')->get()->keyBy('store_id');
        // 5. Refunds
        $refunds = DB::table('refund_requests')->whereIn('store_id', $ids)->whereNull('deleted_at')->whereBetween('created_at', [$f, $t])
            ->groupBy('store_id')->selectRaw('store_id, COUNT(*) AS n, SUM(amount) AS a')->get()->keyBy('store_id');
        // 6. Rating (all time)
        $ratings = DB::table('ratings')->whereIn('store_id', $ids)->groupBy('store_id')->selectRaw('store_id, AVG(rating) AS r, COUNT(*) AS n')->get()->keyBy('store_id');
        // 7. Stock (usable = quantity − expired batches)
        $stock = static::stockRows($ids);
        // 8. Cylinders expiring within 30 days
        $expiring = DB::table('cylinder_batches')->whereIn('store_id', $ids)->where('quantity_remaining', '>', 0)->whereNotNull('requalification_due_on')
            ->whereBetween('requalification_due_on', [now()->toDateString(), now()->addDays(30)->toDateString()])
            ->groupBy('store_id')->selectRaw('store_id, SUM(quantity_remaining) AS n')->pluck('n', 'store_id');
        // 9. Staff on duty now
        $onDuty = DB::table('attendances')->whereIn('store_id', $ids)->whereNull('deleted_at')->whereDate('date', now()->toDateString())
            ->whereNotNull('clock_in')->whereNull('clock_out')->groupBy('store_id')->selectRaw('store_id, COUNT(*) AS n')->pluck('n', 'store_id');
        // 10. Transfers on the way TO each store
        $incoming = DB::table('stock_transfers')->whereIn('to_store_id', $ids)->where('status', 'sent')->groupBy('to_store_id')
            ->selectRaw('to_store_id, COUNT(*) AS n')->pluck('n', 'to_store_id');

        $rows = [];
        foreach ($stores as $s) {
            $st = $byStatus->where('store_id', $s->id);
            $orders = (int) $st->sum('n');
            $cancelled = (int) ($st->firstWhere('status', 'cancelled')->n ?? 0);
            $cur = (float) ($salesCur[$s->id]['sales'] ?? 0);
            $prev = (float) ($salesPrev[$s->id]['sales'] ?? 0);
            $paidOrders = (int) ($salesCur[$s->id]['orders'] ?? 0);
            $stk = $stock->where('store_id', $s->id);
            $low = $stk->filter(fn ($r) => $r->is_active && $r->usable <= $r->reorder_level)->count();
            $rows[] = [
                'id'            => $s->id,
                'name'          => $s->store_name,
                'short'         => $s->isBranch() ? $s->branch_name : 'Main',
                'is_main'       => ! $s->isBranch(),
                'sales'         => round($cur, 2),
                'delivery_fees' => (float) ($salesCur[$s->id]['delivery_fees'] ?? 0),
                'prev_sales'    => round($prev, 2),
                'growth'        => $prev > 0 ? round(($cur - $prev) / $prev * 100, 1) : null,
                'orders'        => $orders,
                'by_status'     => $st->mapWithKeys(fn ($r) => [$r->status => (int) $r->n])->all(),
                'delivered'     => (int) ($st->firstWhere('status', 'delivered')->n ?? 0),
                'aov'           => $paidOrders > 0 ? round($cur / $paidOrders, 2) : 0,
                'cancel_rate'   => $orders > 0 ? round($cancelled / $orders * 100, 1) : 0.0,
                'cancelled'     => $cancelled,
                'delivery_min'  => isset($deliv[$s->id]) ? (int) round((float) $deliv[$s->id]->m) : null,
                'deliveries'    => (int) ($deliv[$s->id]->n ?? 0),
                'refunds'       => (int) ($refunds[$s->id]->n ?? 0),
                'refund_amount' => round((float) ($refunds[$s->id]->a ?? 0), 2),
                'rating'        => isset($ratings[$s->id]) ? round((float) $ratings[$s->id]->r, 1) : null,
                'stock_value'   => round((float) $stk->sum(fn ($r) => $r->usable * $r->unit_cost), 2),
                // K9: products with stock but no known cost (valued at the selling price)
                'no_cost'       => $stk->filter(fn ($r) => $r->usable > 0 && $r->cost_source === 'selling')->count(),
                'low_stock'     => $low,
                'expiring'      => (int) ($expiring[$s->id] ?? 0),
                'on_duty'       => (int) ($onDuty[$s->id] ?? 0),
                'incoming'      => (int) ($incoming[$s->id] ?? 0),
                'plan'          => SubscriptionService::planName(SubscriptionService::currentKey($s)),
                'plan_active'   => SubscriptionService::isActive($s),
                'days_left'     => SubscriptionService::daysLeft($s),
                'alerts'        => $low + (int) ($incoming[$s->id] ?? 0) + (int) ($st->firstWhere('status', 'pending')->n ?? 0),
            ];
        }

        $sum = fn (string $k) => array_sum(array_column($rows, $k));
        $allDeliv = $deliv->sum('n');
        $totals = [
            'sales'        => round($sum('sales'), 2),
            'delivery_fees'=> round($sum('delivery_fees'), 2),
            'orders'       => $sum('orders'),
            'by_status'    => $byStatus->groupBy('status')->map(fn ($g) => (int) $g->sum('n'))->all(),
            'delivered'    => $sum('delivered'),
            'delivery_min' => $allDeliv > 0 ? (int) round($deliv->sum(fn ($r) => (float) $r->m * $r->n) / $allDeliv) : null,
            'refunds'      => $sum('refunds'),
            'refund_amount'=> round($sum('refund_amount'), 2),
            'low_stock'    => $sum('low_stock'),
            'expiring'     => $sum('expiring'),
            'on_duty'      => $sum('on_duty'),
            'stock_value'  => round($sum('stock_value'), 2),
            'no_cost'      => $sum('no_cost'),
        ];

        // Charts: one row per day, one key per store
        $days = [];
        for ($d = $from; $d->lte($to); $d = $d->addDay()) {
            $days[$d->toDateString()] = ['date' => $d->toDateString(), 'label' => $d->format('M j')];
        }
        $sales = $days;
        $orders = $days;
        foreach ($days as $k => $_) {
            foreach ($rows as $r) {
                $sales[$k]["s{$r['id']}"] = 0;
                $orders[$k]["s{$r['id']}"] = 0;
            }
        }
        foreach ($daily as $r) {
            $k = substr((string) $r->d, 0, 10);
            if (isset($orders[$k])) {
                $orders[$k]["s{$r->store_id}"] = (int) $r->n;
            }
        }
        foreach ($salesByDay as $k => $perStore) {
            foreach ($perStore as $sid => $v) {
                if (isset($sales[$k])) {
                    $sales[$k]["s{$sid}"] = $v;
                }
            }
        }

        $suggestions = static::imbalance($stock, $stores);

        return [
            'stores'      => $stores->map(fn ($s) => ['id' => $s->id, 'name' => $s->store_name, 'short' => $s->isBranch() ? $s->branch_name : 'Main', 'is_main' => ! $s->isBranch()])->values()->all(),
            'rows'        => $rows,
            'totals'      => $totals,
            'charts'      => ['sales' => array_values($sales), 'orders' => array_values($orders)],
            'notes'       => static::notes($rows, $suggestions),
            'suggestions' => $suggestions,
        ];
    }

    /** Products of the stores with usable stock (one query + one for expired batches). */
    private static function stockRows(array $ids): \Illuminate\Support\Collection
    {
        $rows = DB::table('products')->join('inventories', 'inventories.product_id', '=', 'products.id')
            ->whereIn('products.store_id', $ids)->whereNull('products.deleted_at')->whereNull('inventories.deleted_at')
            ->select('products.id', 'products.store_id', 'products.name', 'products.product_type', 'products.weight_kg', 'products.brand',
                'products.cost_price', 'products.purchase_price', 'products.selling_price', 'products.is_active', 'inventories.quantity', 'inventories.reorder_level')->get();
        $expired = DB::table('cylinder_batches')->whereIn('store_id', $ids)->where('quantity_remaining', '>', 0)->whereNotNull('requalification_due_on')
            ->where('requalification_due_on', '<', now()->toDateString())->groupBy('product_id')->selectRaw('product_id, SUM(quantity_remaining) AS n')->pluck('n', 'product_id');

        $poCost = static::latestPoCosts($rows->pluck('id')->all());

        return $rows->map(function ($r) use ($expired, $poCost) {
            $r->usable = max(0, (int) $r->quantity - (int) ($expired[$r->id] ?? 0));
            [$r->unit_cost, $r->cost_source] = match (true) {
                // An LPG cost equal to its new-purchase price is the old default (the selling price), not a real cost
                (float) $r->cost_price > 0 && ! ($r->product_type !== 'accessory' && (float) $r->cost_price === (float) $r->purchase_price) => [(float) $r->cost_price, 'cost'],
                isset($poCost[$r->id])     => [(float) $poCost[$r->id], 'po'],
                default                    => [(float) ($r->purchase_price ?: $r->selling_price), 'selling'],
            };
            $r->reorder_level = (int) $r->reorder_level;
            $r->is_active = (bool) $r->is_active;

            return $r;
        });
    }

    /** K9: the unit cost of the latest RECEIVED purchase order line per product (one query). */
    public static function latestPoCosts(array $productIds): array
    {
        if (! $productIds) {
            return [];
        }
        $latest = DB::table('purchase_order_items')->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->whereIn('purchase_order_items.product_id', $productIds)->where('purchase_order_items.quantity_received', '>', 0)
            ->groupBy('purchase_order_items.product_id')->selectRaw('purchase_order_items.product_id AS pid, MAX(purchase_order_items.id) AS id');

        return DB::table('purchase_order_items')->joinSub($latest, 'l', 'l.id', '=', 'purchase_order_items.id')
            ->pluck('purchase_order_items.unit_cost', 'l.pid')->map(fn ($v) => (float) $v)->all();
    }

    /**
     * Stock imbalance per cylinder SIZE: a store at / below its reorder point while another store has more than 2× its
     * reorder point → move enough to bring the low store to 2× its reorder point, without taking the other below 2×.
     */
    public static function imbalance(\Illuminate\Support\Collection $stock, $stores): array
    {
        $names = $stores->mapWithKeys(fn ($s) => [$s->id => $s->isBranch() ? $s->branch_name : 'Main'])->all();
        $out = [];
        $bySize = $stock->filter(fn ($r) => $r->is_active && $r->product_type !== 'accessory' && (float) $r->weight_kg > 0)
            ->groupBy(fn ($r) => rtrim(rtrim(number_format((float) $r->weight_kg, 2, '.', ''), '0'), '.'));
        foreach ($bySize as $size => $products) {
            $perStore = $products->groupBy('store_id')->map(fn ($g) => [
                'usable' => (int) $g->sum('usable'), 'reorder' => (int) $g->sum('reorder_level'),
                'product' => $g->sortByDesc('usable')->first(),   // the product to send from / to
            ]);
            $lows = $perStore->filter(fn ($p) => $p['usable'] <= $p['reorder'])->sortBy('usable');
            $highs = $perStore->filter(fn ($p) => $p['reorder'] > 0 && $p['usable'] > 2 * $p['reorder'])->sortByDesc(fn ($p) => $p['usable'] - 2 * $p['reorder']);
            foreach ($lows as $toId => $low) {
                foreach ($highs as $fromId => &$high) {
                    if ($fromId === $toId) {
                        continue;
                    }
                    $need = max(1, 2 * $low['reorder'] - $low['usable']);
                    $spare = $high['usable'] - 2 * $high['reorder'];
                    $qty = min($need, $spare);
                    if ($qty < 1) {
                        continue;
                    }
                    $high['usable'] -= $qty;
                    $out[] = [
                        'size' => "{$size}kg", 'quantity' => $qty,
                        'from_store_id' => (int) $fromId, 'from_name' => $names[$fromId] ?? 'store', 'from_product_id' => (int) $high['product']->id,
                        'to_store_id' => (int) $toId, 'to_name' => $names[$toId] ?? 'store', 'to_product_id' => (int) $low['product']->id,
                        'text' => "Transfer {$qty} × {$size}kg from " . ($names[$fromId] ?? 'store') . ' to ' . ($names[$toId] ?? 'store'),
                        'why' => ($names[$toId] ?? 'store') . " has {$low['usable']} (reorder at {$low['reorder']}); " . ($names[$fromId] ?? 'store') . ' has ' . ($high['usable'] + $qty) . " (reorder at {$high['reorder']}).",
                    ];
                    break;
                }
                unset($high);
            }
        }

        return $out;
    }

    /** Rule-based notes (each says why). */
    public static function notes(array $rows, array $suggestions): array
    {
        $notes = [];
        $n = count($rows);
        $withGrowth = array_values(array_filter($rows, fn ($r) => $r['growth'] !== null));
        if ($n >= 2 && count($withGrowth) >= 2) {
            usort($withGrowth, fn ($a, $b) => $b['growth'] <=> $a['growth']);
            $best = $withGrowth[0];
            $worst = $withGrowth[count($withGrowth) - 1];
            $fmt = fn ($g) => ($g >= 0 ? '+' : '−') . abs($g) . '%';
            $notes[] = ['type' => 'growth', 'tone' => 'good', 'store_id' => $best['id'],
                'text' => "Best growth: {$best['short']} " . $fmt($best['growth']) . ' sales vs the previous period.'];
            if ($worst['id'] !== $best['id']) {
                $notes[] = ['type' => 'growth', 'tone' => $worst['growth'] < 0 ? 'bad' : 'info', 'store_id' => $worst['id'],
                    'text' => "Lowest growth: {$worst['short']} " . $fmt($worst['growth']) . ' sales vs the previous period.'];
            }
        }
        foreach ($rows as $r) {
            $others = array_filter($rows, fn ($o) => $o['id'] !== $r['id']);
            $oOrders = array_sum(array_column($others, 'orders'));
            if ($r['orders'] >= self::MIN_ORDERS && $r['cancel_rate'] >= self::CANCEL_RATE) {
                $oRate = $oOrders > 0 ? round(array_sum(array_column($others, 'cancelled')) / $oOrders * 100) : null;
                $notes[] = ['type' => 'cancel', 'tone' => 'bad', 'store_id' => $r['id'],
                    'text' => "Check {$r['short']}: " . round($r['cancel_rate']) . '% of orders cancelled' . ($oRate !== null ? " (others {$oRate}%)." : '.')];
            }
        }
        $timed = array_filter($rows, fn ($r) => $r['delivery_min'] !== null && $r['deliveries'] > 0);
        $allN = array_sum(array_column($timed, 'deliveries'));
        $avg = $allN > 0 ? array_sum(array_map(fn ($r) => $r['delivery_min'] * $r['deliveries'], $timed)) / $allN : null;
        if ($avg && count($timed) >= 2) {
            foreach ($timed as $r) {
                if ($r['delivery_min'] >= self::SLOW_FACTOR * $avg) {
                    $notes[] = ['type' => 'slow', 'tone' => 'bad', 'store_id' => $r['id'],
                        'text' => "Check {$r['short']}: deliveries take {$r['delivery_min']} min on average (all stores " . (int) round($avg) . ' min).'];
                }
            }
        }
        foreach ($rows as $r) {
            if (! $r['plan_active']) {
                $notes[] = ['type' => 'plan', 'tone' => 'bad', 'store_id' => $r['id'], 'text' => "Renew {$r['short']}'s plan (it has ended — customers can't see it)."];
            } elseif ($r['days_left'] <= self::PLAN_DAYS) {
                $notes[] = ['type' => 'plan', 'tone' => 'warn', 'store_id' => $r['id'],
                    'text' => "Renew {$r['short']}'s plan ({$r['days_left']} " . ($r['days_left'] === 1 ? 'day' : 'days') . ' left).'];
            }
        }
        foreach ($suggestions as $i => $s) {
            $notes[] = ['type' => 'transfer', 'tone' => 'info', 'store_id' => $s['to_store_id'], 'suggestion' => $i, 'text' => $s['text'] . '.', 'why' => $s['why']];
        }

        return $notes;
    }
}
