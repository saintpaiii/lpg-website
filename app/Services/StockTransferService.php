<?php

namespace App\Services;

use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\StockTransferItem;
use App\Models\StockTransferItemBatch;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * J9 — stock transfers between the stores of ONE owner (Premium: the main store's 'branches' feature to send).
 *
 *  Send     (one transaction) the source's FILLED stock − qty, taken like a sale (undated first, then the earliest
 *           requalification date, never expired — StockService::takeFilled), the batches taken are remembered;
 *           or EMPTY cylinders (inventories.empty_quantity). 'transfer_out' transactions. The destination is told.
 *  Receive  (one transaction) qty received per line (≤ sent) → the destination +received, new batches with the SAME
 *           manufactured / requalification dates (undated stays undated), 'transfer_in'; a shortfall is a cylinder
 *           incident at the source ("lost in transfer", reason other).
 *  Cancel   (only while sent) everything back to the source (to the same batches).
 */
class StockTransferService
{
    // ── Who may do what ──────────────────────────────────────────────────────

    /** The owner of both stores, or staff of the SOURCE store with inventory.transfer. */
    public static function canSendFrom(User $user, Store $from): bool
    {
        return static::actsFor($user, $from);
    }

    /** The owner, or staff of the DESTINATION store with inventory.transfer. */
    public static function canReceive(User $user, StockTransfer $t): bool
    {
        return $t->status === 'sent' && static::actsFor($user, Store::find($t->to_store_id));
    }

    /** The owner, or staff of the SOURCE store with inventory.transfer. */
    public static function canCancel(User $user, StockTransfer $t): bool
    {
        return $t->status === 'sent' && static::actsFor($user, Store::find($t->from_store_id));
    }

    public static function canView(User $user, StockTransfer $t): bool
    {
        if ($user->role === 'seller') {
            return (int) $t->owner_id === (int) $user->id;
        }

        return $user->role === 'seller_staff' && in_array((int) $user->store_id, [(int) $t->from_store_id, (int) $t->to_store_id], true)
            && StaffAccess::levelFor($user, 'inventory') !== null;
    }

    private static function actsFor(User $user, ?Store $store): bool
    {
        if (! $store) {
            return false;
        }
        if ($user->role === 'seller') {
            return (int) $store->user_id === (int) $user->id;
        }

        return $user->role === 'seller_staff' && (int) $user->store_id === (int) $store->id && $user->hasPermission('inventory.transfer');
    }

    // ── Products ─────────────────────────────────────────────────────────────

    /** The destination product matching a source product: same type, size and brand (else same type + size). */
    public static function suggest(Product $from, Store $to): ?Product
    {
        $base = Product::where('store_id', $to->id)->where('product_type', $from->product_type)
            ->when($from->isAccessory(), fn ($q) => $q->where('name', $from->name), fn ($q) => $q->where('weight_kg', $from->weight_kg));

        return (clone $base)->where('brand', $from->brand)->orderByDesc('is_active')->first()
            ?? ($from->isAccessory() ? null : (clone $base)->orderByDesc('is_active')->first());
    }

    // ── Send ─────────────────────────────────────────────────────────────────

    /**
     * @param  array<int, array{from_product_id: int, to_product_id: int, quantity: int, empties?: bool}>  $lines
     */
    public static function send(User $by, Store $from, Store $to, array $lines, ?string $notes = null): StockTransfer
    {
        $ownerId = (int) $from->user_id;
        if ($from->id === $to->id) {
            throw ValidationException::withMessages(['to_store_id' => 'Choose a different store to send to.']);
        }
        if ((int) $to->user_id !== $ownerId || $from->status !== 'approved' || $to->status !== 'approved') {
            throw ValidationException::withMessages(['to_store_id' => 'You can only transfer between your own approved stores.']);
        }
        if (! static::canSendFrom($by, $from)) {
            throw ValidationException::withMessages(['from_store_id' => "You can't send stock from this store."]);
        }
        if (! $lines) {
            throw ValidationException::withMessages(['lines' => 'Add at least one product.']);
        }

        $transfer = DB::transaction(function () use ($by, $from, $to, $lines, $notes, $ownerId) {
            // Per-owner numbering, safe against two sends at once
            DB::table('users')->where('id', $ownerId)->lockForUpdate()->first();
            $n = (int) StockTransfer::where('owner_id', $ownerId)->count() + 1;
            $number = 'TR-' . str_pad((string) $n, 6, '0', STR_PAD_LEFT);

            $t = StockTransfer::create([
                'owner_id' => $ownerId, 'from_store_id' => $from->id, 'to_store_id' => $to->id, 'transfer_number' => $number,
                'status' => 'sent', 'notes' => $notes ?: null, 'sent_by' => $by->id, 'sent_at' => now(),
            ]);

            foreach (array_values($lines) as $i => $line) {
                $qty = (int) ($line['quantity'] ?? 0);
                $empties = (bool) ($line['empties'] ?? false);
                $fp = Product::where('store_id', $from->id)->find($line['from_product_id'] ?? 0);
                $tp = Product::where('store_id', $to->id)->find($line['to_product_id'] ?? 0);
                if (! $fp || ! $tp) {
                    throw ValidationException::withMessages(["lines.{$i}.to_product_id" => 'Choose a product of each store.']);
                }
                if ($fp->product_type !== $tp->product_type || (! $fp->isAccessory() && (float) $fp->weight_kg !== (float) $tp->weight_kg)) {
                    throw ValidationException::withMessages(["lines.{$i}.to_product_id" => "{$tp->name} isn't the same kind of product as {$fp->name}."]);
                }
                if ($empties && $fp->isAccessory()) {
                    throw ValidationException::withMessages(["lines.{$i}.empties" => 'Only LPG cylinders have empties.']);
                }
                if ($qty < 1) {
                    throw ValidationException::withMessages(["lines.{$i}.quantity" => 'Enter at least 1.']);
                }
                $inv = Inventory::where('product_id', $fp->id)->lockForUpdate()->first();
                $have = $empties ? (int) ($inv?->empty_quantity ?? 0) : StockService::usableFilled($fp->id, $inv);
                if (! $inv || $qty > $have) {
                    throw ValidationException::withMessages(["lines.{$i}.quantity" => ($empties ? 'Only ' . $have . ' empty' : "Only {$have} usable") . " {$fp->name} in stock."]);
                }

                $item = StockTransferItem::create(['stock_transfer_id' => $t->id, 'from_product_id' => $fp->id, 'to_product_id' => $tp->id,
                    'empties' => $empties, 'quantity' => $qty]);
                if ($empties) {
                    $inv->decrement('empty_quantity', $qty);
                } else {
                    foreach (StockService::takeFilled($inv, $qty) as $batchId => $take) {
                        StockTransferItemBatch::create(['stock_transfer_item_id' => $item->id, 'cylinder_batch_id' => $batchId, 'quantity' => $take]);
                    }
                }
                InventoryTransaction::create(['product_id' => $fp->id, 'type' => 'transfer_out', 'quantity' => $qty, 'reference' => $number,
                    'notes' => ($empties ? 'Empty cylinders' : 'Stock') . " sent to {$to->store_name}", 'user_id' => $by->id]);
            }

            return $t;
        });

        StockService::forgetPrimed();
        NotificationService::sendToStore($to->id, 'system', 'Stock transfer on the way',
            "{$transfer->transfer_number} from {$from->store_name}: " . static::summary($transfer) . '. Receive it in Inventory → Transfers.',
            ['link' => '/seller/inventory?tab=transfers' . static::storeParam($to)]);

        return $transfer;
    }

    // ── Receive ──────────────────────────────────────────────────────────────

    /** @param  array<int, int>  $received  stock_transfer_item_id → quantity received (missing = all of it) */
    public static function receive(StockTransfer $t, User $by, array $received): StockTransfer
    {
        if (! static::canReceive($by, $t)) {
            throw ValidationException::withMessages(['transfer' => $t->status === 'sent' ? "You can't receive this transfer." : 'This transfer is no longer on the way.']);
        }

        DB::transaction(function () use ($t, $by, $received) {
            $row = StockTransfer::whereKey($t->id)->lockForUpdate()->first();
            if ($row->status !== 'sent') {
                throw ValidationException::withMessages(['transfer' => 'This transfer is no longer on the way.']);
            }
            $from = Store::withTrashed()->find($row->from_store_id);
            foreach ($row->items()->with(['fromProduct', 'toProduct', 'batches.batch'])->get() as $item) {
                $got = array_key_exists($item->id, $received) ? (int) $received[$item->id] : (int) $item->quantity;
                if ($got < 0 || $got > $item->quantity) {
                    throw ValidationException::withMessages(["received.{$item->id}" => "Between 0 and {$item->quantity}."]);
                }
                $item->update(['quantity_received' => $got]);
                $inv = Inventory::firstOrCreate(['product_id' => $item->to_product_id], ['quantity' => 0, 'reorder_level' => 10]);
                Inventory::whereKey($inv->id)->lockForUpdate()->first();

                if ($item->empties) {
                    $inv->increment('empty_quantity', $got);
                    $shortBatch = null;
                } else {
                    // Received cylinders: the undated part first (it was taken first), then each source batch in order;
                    // a shortfall comes off the last batches
                    $batchTotal = (int) $item->batches->sum('quantity');
                    $left = $got - min($got, max(0, (int) $item->quantity - $batchTotal));   // what's left for the dated part
                    $shortBatch = null;
                    foreach ($item->batches as $alloc) {
                        $n = min($left, (int) $alloc->quantity);
                        $left -= $n;
                        if ($n < (int) $alloc->quantity) {
                            $shortBatch ??= $alloc->cylinder_batch_id;
                        }
                        if ($n > 0 && $alloc->batch) {
                            CylinderBatch::create([
                                'store_id'               => $row->to_store_id,
                                'product_id'             => $item->to_product_id,
                                'supplier_id'            => $alloc->batch->supplier_id,
                                'batch_code'             => CylinderBatch::nextCode((int) $row->to_store_id),
                                'source'                 => 'transfer',
                                'quantity_received'      => $n,
                                'quantity_remaining'     => $n,
                                'manufactured_on'        => $alloc->batch->manufactured_on,
                                'requalification_due_on' => $alloc->batch->requalification_due_on,
                                'received_on'            => now()->toDateString(),
                                'notes'                  => "From {$row->transfer_number} ({$from?->store_name}, batch {$alloc->batch->batch_code})",
                            ]);
                        }
                    }
                    $inv->increment('quantity', $got);
                }
                if ($got > 0) {
                    InventoryTransaction::create(['product_id' => $item->to_product_id, 'type' => 'transfer_in', 'quantity' => $got, 'reference' => $row->transfer_number,
                        'notes' => ($item->empties ? 'Empty cylinders' : 'Stock') . " received from {$from?->store_name}", 'user_id' => $by->id]);
                }

                // Shortfall: recorded at the SOURCE as a cylinder incident (lost in transfer)
                $short = (int) $item->quantity - $got;
                if ($short > 0) {
                    $incident = CylinderIncident::create([
                        'store_id' => $row->from_store_id, 'product_id' => $item->from_product_id, 'cylinder_batch_id' => $shortBatch,
                        'quantity' => $short, 'reason' => 'other', 'source' => 'stock_check', 'was_empty' => (bool) $item->empties,
                        'note' => "Lost in transfer {$row->transfer_number} (sent {$item->quantity}, received {$got})",
                        'status' => 'disposed', 'recorded_by' => $by->id,
                    ]);
                    $item->update(['cylinder_incident_id' => $incident->id]);
                }
            }
            $row->update(['status' => 'received', 'received_by' => $by->id, 'received_at' => now()]);
        });

        StockService::forgetPrimed();
        $t->refresh();
        $short = (int) $t->items()->sum(DB::raw('quantity - COALESCE(quantity_received, 0)'));
        NotificationService::sendToStore((int) $t->from_store_id, 'system', 'Stock transfer received',
            "{$t->transfer_number} was received by " . Store::withTrashed()->whereKey($t->to_store_id)->value('store_name')
                . ($short > 0 ? " — {$short} missing (recorded as lost in transfer)." : '.'),
            ['link' => '/seller/inventory?tab=transfers' . static::storeParam(Store::find($t->from_store_id))]);

        return $t;
    }

    // ── Cancel ───────────────────────────────────────────────────────────────

    public static function cancel(StockTransfer $t, User $by): StockTransfer
    {
        if (! static::canCancel($by, $t)) {
            throw ValidationException::withMessages(['transfer' => $t->status === 'sent' ? "You can't cancel this transfer." : 'Only a transfer that is on the way can be cancelled.']);
        }
        DB::transaction(function () use ($t, $by) {
            $row = StockTransfer::whereKey($t->id)->lockForUpdate()->first();
            if ($row->status !== 'sent') {
                throw ValidationException::withMessages(['transfer' => 'Only a transfer that is on the way can be cancelled.']);
            }
            foreach ($row->items()->with('batches')->get() as $item) {
                $inv = Inventory::where('product_id', $item->from_product_id)->lockForUpdate()->first()
                    ?? Inventory::create(['product_id' => $item->from_product_id, 'quantity' => 0, 'reorder_level' => 10]);
                if ($item->empties) {
                    $inv->increment('empty_quantity', $item->quantity);
                } else {
                    foreach ($item->batches as $alloc) {
                        CylinderBatch::whereKey($alloc->cylinder_batch_id)->increment('quantity_remaining', $alloc->quantity);
                    }
                    $inv->increment('quantity', $item->quantity);
                }
                InventoryTransaction::create(['product_id' => $item->from_product_id, 'type' => 'transfer_in', 'quantity' => $item->quantity,
                    'reference' => $row->transfer_number, 'notes' => 'Transfer cancelled — back in stock', 'user_id' => $by->id]);
            }
            $row->update(['status' => 'cancelled', 'cancelled_by' => $by->id, 'cancelled_at' => now()]);
        });
        StockService::forgetPrimed();
        NotificationService::sendToStore((int) $t->to_store_id, 'system', 'Stock transfer cancelled',
            "{$t->transfer_number} was cancelled — nothing is coming.", ['link' => '/seller/inventory?tab=transfers' . static::storeParam(Store::find($t->to_store_id))]);

        return $t->refresh();
    }

    // ── Presentation ─────────────────────────────────────────────────────────

    /** "20 × 11kg Petron Gasul, 5 × 11kg Petron Gasul (empty)" */
    public static function summary(StockTransfer $t): string
    {
        return $t->items()->with('fromProduct:id,name')->get()
            ->map(fn ($i) => "{$i->quantity} × {$i->fromProduct?->name}" . ($i->empties ? ' (empty)' : ''))->implode(', ');
    }

    /** Rows for the Transfers lists (a store's in/out, or all of an owner's). */
    public static function rows(\Illuminate\Database\Eloquent\Builder $query, User $viewer): array
    {
        return $query->with(['items.fromProduct:id,name', 'items.toProduct:id,name', 'items.incident:id,quantity,note', 'fromStore:id,store_name', 'toStore:id,store_name', 'sender:id,name', 'receiver:id,name'])
            ->orderByDesc('id')->limit(100)->get()->map(fn (StockTransfer $t) => [
                'id'          => $t->id,
                'number'      => $t->transfer_number,
                'status'      => $t->status,
                'status_label'=> StockTransfer::STATUS_LABELS[$t->status] ?? $t->status,
                'from'        => ['id' => $t->from_store_id, 'name' => $t->fromStore?->store_name],
                'to'          => ['id' => $t->to_store_id, 'name' => $t->toStore?->store_name],
                'notes'       => $t->notes,
                'sent_by'     => $t->sender?->name,
                'sent_at'     => $t->sent_at?->toIso8601String(),
                'received_by' => $t->receiver?->name,
                'received_at' => $t->received_at?->toIso8601String(),
                'can_receive' => static::canReceive($viewer, $t),
                'can_cancel'  => static::canCancel($viewer, $t),
                'items'       => $t->items->map(fn ($i) => [
                    'id' => $i->id, 'from' => $i->fromProduct?->name, 'to' => $i->toProduct?->name, 'empties' => $i->empties,
                    'quantity' => $i->quantity, 'received' => $i->quantity_received,
                    'lost' => $i->incident ? (int) $i->incident->quantity : 0,
                ])->values(),
            ])->values()->all();
    }

    /** "&store=12" so an owner's link opens the right store (EnsureIsSeller switches); nothing for staff-only stores. */
    public static function storeParam(?Store $store): string
    {
        return $store ? "&store={$store->id}" : '';
    }

    /** View data of the printable transfer slip. */
    public static function slipData(StockTransfer $t): array
    {
        $t->loadMissing(['items.fromProduct', 'items.toProduct', 'fromStore', 'toStore', 'sender', 'receiver']);

        return [
            'transfer' => $t,
            'from'     => $t->fromStore,
            'to'       => $t->toStore,
            'rows'     => $t->items->map(fn ($i) => [
                'from' => $i->fromProduct?->name . ($i->empties ? ' (empty)' : ''), 'to' => $i->toProduct?->name,
                'qty' => $i->quantity, 'received' => $i->quantity_received,
            ])->all(),
        ];
    }
}
