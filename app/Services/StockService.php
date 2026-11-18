<?php

namespace App\Services;

use App\Exceptions\StockUnavailableException;
use App\Models\CylinderBatch;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemBatch;
use App\Models\Product;
use Illuminate\Validation\ValidationException;

/**
 * J7 — the ONE place for stock moves of order lines and cylinder batches.
 *
 *  inventories.quantity          FILLED (sellable) cylinders / accessories — includes batched AND older unbatched stock
 *  cylinder_batches.remaining    the part of `quantity` that came in a known batch (requalification date on the collar)
 *  unbatched                     quantity − Σ remaining (stock from before J7) — still sells, never blocks an order
 *  usable                        quantity − remaining of EXPIRED batches (never sold)
 *
 * Confirm takes unbatched stock first (it's the oldest — K6), then the non-expired batches by requalification date
 * (FIFO) and records order_item_batches; "Add dates to old stock" turns unbatched stock into an 'opening' batch.
 * a cancel gives the cylinders back to the same batches. Empties (refills) and the damaged count live on the inventory row.
 */
class StockService
{
    /** Filled cylinders of EXPIRED batches still in stock (counted in quantity, never sold). */
    public static function expiredRemaining(int $productId): int
    {
        return (int) CylinderBatch::where('product_id', $productId)->where('quantity_remaining', '>', 0)
            ->whereNotNull('requalification_due_on')->whereDate('requalification_due_on', '<', now()->toDateString())->sum('quantity_remaining');
    }

    /** Sellable filled stock: non-expired batches + unbatched stock. */
    public static function usableFilled(int $productId, ?Inventory $inventory = null): int
    {
        $inventory ??= Inventory::where('product_id', $productId)->first();

        return max(0, (int) ($inventory?->quantity ?? 0) - static::expiredRemaining($productId));
    }

    /**
     * K6 — sellable stock for MANY products in two queries (customer pages: product grid, store page, cart, checkout).
     * Products without an inventory row → 0.
     *
     * @param  iterable<int>  $productIds
     * @return array<int, int>  product_id → usable filled
     */
    public static function usableMap(iterable $productIds): array
    {
        $ids = collect($productIds)->map(fn ($id) => (int) $id)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }
        $qty = Inventory::whereIn('product_id', $ids)->pluck('quantity', 'product_id');
        $expired = CylinderBatch::whereIn('product_id', $ids)->where('quantity_remaining', '>', 0)->whereNotNull('requalification_due_on')
            ->whereDate('requalification_due_on', '<', now()->toDateString())->groupBy('product_id')
            ->selectRaw('product_id, SUM(quantity_remaining) AS n')->pluck('n', 'product_id');

        return $ids->mapWithKeys(fn ($id) => [$id => max(0, (int) ($qty[$id] ?? 0) - (int) ($expired[$id] ?? 0))])->all();
    }

    /**
     * K6 — preload sellable stock for a page of products (two queries), read with sellable(). Memo per request
     * (request attributes, like StaffAccess), so a later request never sees stale numbers.
     *
     * @param  iterable<int|Product>  $products
     */
    public static function prime(iterable $products): void
    {
        $ids = collect($products)->map(fn ($p) => $p instanceof Product ? $p->id : (int) $p)->all();
        $bag = request()->attributes;
        $bag->set('stock.usable', static::usableMap($ids) + ($bag->get('stock.usable') ?? []));
    }

    /** What customers can buy: usable filled stock (expired batches never count). Uses prime()'s memo when present. */
    public static function sellable(Product|int $product): int
    {
        $id = $product instanceof Product ? $product->id : $product;
        $map = request()->attributes->get('stock.usable') ?? [];
        if (array_key_exists($id, $map)) {
            return $map[$id];
        }
        $inventory = $product instanceof Product && $product->relationLoaded('inventory') ? $product->inventory : null;

        return static::usableFilled($id, $inventory);
    }

    /** Forget the memo (after stock changed in the same request). */
    public static function forgetPrimed(): void
    {
        request()->attributes->remove('stock.usable');
    }

    /** Filled stock with no batch (pre-J7 stock): quantity − Σ remaining of all batches. */
    public static function unbatched(int $productId, ?Inventory $inventory = null): int
    {
        $inventory ??= Inventory::where('product_id', $productId)->first();

        return max(0, (int) ($inventory?->quantity ?? 0) - (int) CylinderBatch::where('product_id', $productId)->sum('quantity_remaining'));
    }

    /**
     * Throws unless every line can be served from usable stock — a StockUnavailableException (K6): a red toast on the
     * page for web requests, a 422 JSON message for API callers.
     * "Only expired cylinders left for 11kg Petron — record them as expired or restock." when expired stock is all that's left.
     *
     * @param  iterable<OrderItem>  $items
     */
    public static function assertAvailable(iterable $items): void
    {
        $need = [];
        foreach ($items as $item) {
            $need[$item->product_id] = ($need[$item->product_id] ?? 0) + (int) $item->quantity;
        }
        foreach ($need as $productId => $qty) {
            $inventory = Inventory::where('product_id', $productId)->lockForUpdate()->first();
            $name = Product::withTrashed()->whereKey($productId)->value('name') ?? 'this product';
            if (! $inventory) {
                throw new StockUnavailableException("No inventory record for {$name}.");
            }
            $usable = static::usableFilled($productId, $inventory);
            if ($usable >= $qty) {
                continue;
            }
            if ((int) $inventory->quantity >= $qty) {
                throw new StockUnavailableException("Only expired cylinders left for {$name} — record them as expired or restock.");
            }
            throw new StockUnavailableException("Insufficient stock for {$name}. Available: {$usable}.");
        }
    }

    /**
     * Take one order line out of stock. K6: unbatched (pre-J7) stock is the OLDEST, so it goes first; then batches by
     * the earliest requalification date (FIFO). Batch allocations are recorded in order_item_batches.
     */
    public static function takeForItem(OrderItem $item, ?int $userId, string $reference, string $note = 'Order confirmed', string $type = 'order'): void
    {
        $qty = (int) $item->quantity;
        if ($qty <= 0) {
            return;
        }
        $inventory = Inventory::where('product_id', $item->product_id)->lockForUpdate()->first();
        if (! $inventory) {
            return;
        }
        $left = $qty - min($qty, static::unbatched($item->product_id, $inventory));   // the rest comes from batches
        $batches = CylinderBatch::where('product_id', $item->product_id)->where('quantity_remaining', '>', 0)
            ->where(fn ($q) => $q->whereNull('requalification_due_on')->orWhereDate('requalification_due_on', '>=', now()->toDateString()))
            ->orderByRaw('requalification_due_on IS NULL, requalification_due_on ASC')->orderBy('received_on')->orderBy('id')
            ->lockForUpdate()->get();
        foreach ($batches as $batch) {
            if ($left <= 0) {
                break;
            }
            $take = min($left, (int) $batch->quantity_remaining);
            $batch->decrement('quantity_remaining', $take);
            OrderItemBatch::create(['order_item_id' => $item->id, 'cylinder_batch_id' => $batch->id, 'quantity' => $take]);
            $left -= $take;
        }
        // The unbatched part is just the inventory count
        $inventory->decrement('quantity', $qty);
        InventoryTransaction::create(['product_id' => $item->product_id, 'type' => $type, 'quantity' => $qty, 'reference' => $reference, 'notes' => $note, 'user_id' => $userId]);
    }

    /**
     * Put $qty of an order line back into stock (cancel / item cancelled at handover): back to the batches it came from
     * (latest allocation first), anything beyond that back to unbatched stock.
     */
    public static function returnForItem(OrderItem $item, int $qty, ?int $userId, string $reference, string $note = 'Order cancelled — stock restored', string $type = 'cancelled'): void
    {
        if ($qty <= 0) {
            return;
        }
        $inventory = Inventory::where('product_id', $item->product_id)->lockForUpdate()->first();
        if (! $inventory) {
            return;
        }
        $left = $qty;
        foreach (OrderItemBatch::where('order_item_id', $item->id)->orderByDesc('id')->get() as $alloc) {
            if ($left <= 0) {
                break;
            }
            $back = min($left, (int) $alloc->quantity);
            CylinderBatch::whereKey($alloc->cylinder_batch_id)->increment('quantity_remaining', $back);
            $back === (int) $alloc->quantity ? $alloc->delete() : $alloc->decrement('quantity', $back);
            $left -= $back;
        }
        $inventory->increment('quantity', $qty);
        InventoryTransaction::create(['product_id' => $item->product_id, 'type' => $type, 'quantity' => $qty, 'reference' => $reference, 'notes' => $note, 'user_id' => $userId]);
    }

    /** Confirm: check every line, then take each one (call inside the confirm transaction). */
    public static function takeForOrder(Order $order, ?int $userId): void
    {
        $order->loadMissing('items.product');
        static::assertAvailable($order->items);
        foreach ($order->items as $item) {
            static::takeForItem($item, $userId, $order->order_number);
        }
    }

    /** Cancel: every line back (to its batches). */
    public static function returnForOrder(Order $order, ?int $userId, string $note): void
    {
        foreach (OrderItem::where('order_id', $order->id)->get() as $item) {
            static::returnForItem($item, (int) $item->quantity, $userId, $order->order_number, $note);
        }
    }

    /**
     * Filled cylinders / accessories coming in (PO receiving, manual Stock In, supplier replacement): quantity += qty and,
     * for LPG with a requalification date, a cylinder batch. Returns the batch (null for accessories / no batch).
     */
    public static function receive(Product $product, int $qty, array $batch, ?int $userId, ?string $reference, string $note, string $type = 'in'): ?CylinderBatch
    {
        if ($qty <= 0) {
            return null;
        }
        $inventory = Inventory::firstOrCreate(['product_id' => $product->id], ['quantity' => 0, 'reorder_level' => 10]);
        Inventory::whereKey($inventory->id)->lockForUpdate()->first();
        $inventory->increment('quantity', $qty);
        InventoryTransaction::create(['product_id' => $product->id, 'type' => $type, 'quantity' => $qty, 'reference' => $reference, 'notes' => $note, 'user_id' => $userId]);

        if ($product->isAccessory() || empty($batch['requalification_due_on'])) {
            return null;
        }

        return CylinderBatch::create([
            'store_id'               => $product->store_id,
            'product_id'             => $product->id,
            'purchase_order_item_id' => $batch['purchase_order_item_id'] ?? null,
            'supplier_id'            => $batch['supplier_id'] ?? null,
            'batch_code'             => trim((string) ($batch['batch_code'] ?? '')) ?: CylinderBatch::nextCode($product->store_id),
            'source'                 => $batch['source'] ?? 'stock_in',
            'quantity_received'      => $qty,
            'quantity_remaining'     => $qty,
            'manufactured_on'        => $batch['manufactured_on'] ?? null,
            'requalification_due_on' => $batch['requalification_due_on'],
            'received_on'            => $batch['received_on'] ?? now()->toDateString(),
            'notes'                  => $batch['notes'] ?? null,
        ]);
    }

    /**
     * Keep Σ batch remaining ≤ filled quantity (a manual Stock Out or a damaged record that hit unbatched stock):
     * the excess comes off the oldest batches first.
     */
    public static function reconcileBatches(int $productId): void
    {
        $filled = (int) Inventory::where('product_id', $productId)->value('quantity');
        $excess = (int) CylinderBatch::where('product_id', $productId)->sum('quantity_remaining') - $filled;
        if ($excess <= 0) {
            return;
        }
        foreach (CylinderBatch::where('product_id', $productId)->where('quantity_remaining', '>', 0)
            ->orderByRaw('requalification_due_on IS NULL, requalification_due_on ASC')->orderBy('received_on')->orderBy('id')->get() as $batch) {
            if ($excess <= 0) {
                break;
            }
            $cut = min($excess, (int) $batch->quantity_remaining);
            $batch->decrement('quantity_remaining', $cut);
            $excess -= $cut;
        }
    }

    // ── Empties ──────────────────────────────────────────────────────────────

    /**
     * A refill order's empty tanks were collected (rider or pick-up): empty_quantity += the refill quantity still on the
     * order per product (tanks refused at handover — J4 — stayed with the customer and are not on the order any more).
     * Safe to call once per order (Order::assertEmptyTanksCollected guards it).
     */
    public static function emptiesCollected(Order $order, ?int $userId): void
    {
        $lines = OrderItem::with('product')->where('order_id', $order->id)->where('quantity', '>', 0)->get()
            ->filter(fn (OrderItem $i) => ($i->transaction_type ?? $order->transaction_type) === 'refill' && $i->product && $i->product->isLpg() && (float) $i->product->weight_kg > 0)
            ->groupBy('product_id');
        foreach ($lines as $productId => $items) {
            $qty = (int) $items->sum('quantity');
            static::emptiesIn((int) $productId, $qty, $userId, $order->order_number, 'Empty tanks collected from the customer (refill)');
        }
    }

    public static function emptiesIn(int $productId, int $qty, ?int $userId, string $reference, string $note): void
    {
        if ($qty <= 0) {
            return;
        }
        $inventory = Inventory::firstOrCreate(['product_id' => $productId], ['quantity' => 0, 'reorder_level' => 10]);
        $inventory->increment('empty_quantity', $qty);
        InventoryTransaction::create(['product_id' => $productId, 'type' => 'empty_in', 'quantity' => $qty, 'reference' => $reference, 'notes' => $note, 'user_id' => $userId]);
    }

    /** Empties leaving the store (handed to a supplier, or a refused tank counted by mistake). Never below 0. */
    public static function emptiesOut(int $productId, int $qty, ?int $userId, string $reference, string $note): int
    {
        $inventory = Inventory::where('product_id', $productId)->lockForUpdate()->first();
        $qty = min($qty, (int) ($inventory?->empty_quantity ?? 0));
        if ($qty <= 0) {
            return 0;
        }
        $inventory->decrement('empty_quantity', $qty);
        InventoryTransaction::create(['product_id' => $productId, 'type' => 'empty_out', 'quantity' => $qty, 'reference' => $reference, 'notes' => $note, 'user_id' => $userId]);

        return $qty;
    }

    /**
     * Validation helper for forms: the batch date fields of LPG stock coming in (PO receive, Stock In, supplier
     * replacement, dating old stock). Friendly sentences, keyed "{$prefix}field" (e.g. "rows.12.manufactured_on").
     */
    public static function requireBatchDates(Product $product, array $data, string $prefix = ''): void
    {
        if ($product->isLpg() && empty($data['requalification_due_on'])) {
            throw ValidationException::withMessages([$prefix . 'requalification_due_on' => 'Enter the requalification (expiry) date stamped on the cylinder collar.']);
        }
        static::checkBatchDates($data, $prefix);
    }

    /** manufactured_on: not in the future, and before the requalification date (K6). */
    public static function checkBatchDates(array $data, string $prefix = ''): void
    {
        $made = $data['manufactured_on'] ?? null;
        if (! $made) {
            return;
        }
        $madeOn = \Illuminate\Support\Carbon::parse($made)->startOfDay();
        if ($madeOn->isAfter(now()->startOfDay())) {
            throw ValidationException::withMessages([$prefix . 'manufactured_on' => static::BATCH_DATE_MESSAGES['manufactured_on.before_or_equal']]);
        }
        $due = $data['requalification_due_on'] ?? null;
        if ($due && ! $madeOn->isBefore(\Illuminate\Support\Carbon::parse($due)->startOfDay())) {
            throw ValidationException::withMessages([$prefix . 'manufactured_on' => 'Manufactured date must be before the requalification date.']);
        }
    }

    /** Friendly messages for the batch date rules ("{prefix}field.rule" — use with a "rows.*." prefix for row forms). */
    public const BATCH_DATE_MESSAGES = [
        'manufactured_on.date'                 => 'Enter a valid manufactured date.',
        'manufactured_on.before_or_equal'      => "Manufactured date can't be in the future.",
        'requalification_due_on.date'          => 'Enter a valid requalification date.',
        'requalification_due_on.required'      => 'Enter the requalification (expiry) date stamped on the cylinder collar.',
        'requalification_due_on.required_if'   => 'Enter the requalification date of the replacement cylinders.',
        'requalification_due_on.after'         => 'The requalification date must be in the future — expired cylinders are recorded with "Record damaged / expired".',
        'batch_code.max'                       => 'The batch code can be at most 40 characters.',
    ];

    public static function batchDateMessages(string $prefix = ''): array
    {
        return collect(static::BATCH_DATE_MESSAGES)->mapWithKeys(fn ($m, $k) => [$prefix . $k => $m])->all();
    }

    /**
     * K6 — "Add dates to old stock": turn $qty of the unbatched (pre-J7) filled stock into a batch with source 'opening'.
     * No stock number changes — the cylinders were already counted in inventories.quantity.
     */
    public static function dateOldStock(Product $product, int $qty, array $data, ?int $userId): CylinderBatch
    {
        return \Illuminate\Support\Facades\DB::transaction(function () use ($product, $qty, $data, $userId) {
            $inventory = Inventory::where('product_id', $product->id)->lockForUpdate()->first();
            $undated = static::unbatched($product->id, $inventory);
            if ($qty < 1 || $qty > $undated) {
                throw ValidationException::withMessages(['quantity' => $undated > 0
                    ? "You can date at most {$undated} undated cylinder(s) of {$product->name}."
                    : "{$product->name} has no undated stock."]);
            }
            static::requireBatchDates($product, $data);

            return CylinderBatch::create([
                'store_id'               => $product->store_id,
                'product_id'             => $product->id,
                'batch_code'             => trim((string) ($data['batch_code'] ?? '')) ?: CylinderBatch::nextCode($product->store_id),
                'source'                 => 'opening',
                'quantity_received'      => $qty,
                'quantity_remaining'     => $qty,
                'manufactured_on'        => $data['manufactured_on'] ?? null,
                'requalification_due_on' => $data['requalification_due_on'],
                // Old stock: received before the batches existed — sorted with the other batches by requalification date
                'received_on'            => $data['received_on'] ?? now()->toDateString(),
                'notes'                  => 'Opening stock dated by ' . (\App\Models\User::whereKey($userId)->value('name') ?? 'the store'),
            ]);
        });
    }
}
