<?php

namespace App\Services;

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
 * Confirm takes from the oldest non-expired batch first (FIFO by requalification date) and records order_item_batches;
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
     * Throws (422 message) unless every line can be served from usable stock.
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
                abort(422, "No inventory record for {$name}.");
            }
            $usable = static::usableFilled($productId, $inventory);
            if ($usable >= $qty) {
                continue;
            }
            if ((int) $inventory->quantity >= $qty) {
                abort(422, "Only expired cylinders left for {$name} — record them as expired or restock.");
            }
            abort(422, "Insufficient stock for {$name}. Available: {$usable}.");
        }
    }

    /** Take one order line out of stock: FIFO batches first, the rest from unbatched stock. */
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
        $left = $qty;
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
        // $left > 0 → unbatched (pre-J7) stock: just the inventory count
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

    /** Validation helper for forms: the batch date fields are required for LPG stock coming in. */
    public static function requireBatchDates(Product $product, array $data, string $prefix = ''): void
    {
        if ($product->isLpg() && empty($data['requalification_due_on'])) {
            throw ValidationException::withMessages([$prefix . 'requalification_due_on' => 'Enter the requalification (expiry) date stamped on the cylinder collar.']);
        }
    }
}
