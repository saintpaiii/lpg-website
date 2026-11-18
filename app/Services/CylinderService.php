<?php

namespace App\Services;

use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\SupplierReturn;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * J7 Part D — the store's own damaged / expired cylinders and returns to suppliers.
 *  record    filled (or empty) −qty → damaged +qty, batch −qty (filled), incident 'held'
 *  return    held incidents → one supplier return (RT-000001), incidents 'returned'
 *  replaced  damaged −qty, filled +qty in a new batch (source return)       credited  damaged −qty (amount noted)
 *  rejected  incidents back to 'held' (still damaged) → dispose: damaged −qty, transaction 'out'
 */
class CylinderService
{
    /**
     * Record damaged / expired cylinders. $batchId null → the oldest batch with stock (by requalification date) for filled.
     *
     * @return CylinderIncident
     */
    public static function record(Product $product, int $qty, string $reason, ?int $batchId, ?string $note, ?UploadedFile $photo, bool $wasEmpty, ?int $userId, string $source = 'stock_check'): CylinderIncident
    {
        if ($product->isAccessory()) {
            throw ValidationException::withMessages(['product' => 'Damaged / expired cylinders are recorded for LPG products only.']);
        }
        if (! array_key_exists($reason, CylinderIncident::REASONS)) {
            throw ValidationException::withMessages(['reason' => 'Choose a reason.']);
        }

        $path = $photo?->store('cylinder_incidents', 'local');   // private — DocumentFileController

        $incident = DB::transaction(function () use ($product, $qty, $reason, $batchId, $note, $path, $wasEmpty, $userId, $source) {
            $inventory = Inventory::where('product_id', $product->id)->lockForUpdate()->first();
            if (! $inventory) {
                throw ValidationException::withMessages(['quantity' => 'No inventory record for this product.']);
            }
            $have = $wasEmpty ? (int) $inventory->empty_quantity : (int) $inventory->quantity;
            if ($qty < 1 || $qty > $have) {
                throw ValidationException::withMessages(['quantity' => 'Only ' . $have . ($wasEmpty ? ' empty' : ' filled') . " {$product->name} cylinder(s) in stock."]);
            }

            $batch = null;
            if (! $wasEmpty) {
                $batch = $batchId
                    ? CylinderBatch::where('product_id', $product->id)->whereKey($batchId)->lockForUpdate()->first()
                    : CylinderBatch::where('product_id', $product->id)->where('quantity_remaining', '>', 0)
                        ->orderByRaw('requalification_due_on IS NULL, requalification_due_on ASC')->orderBy('received_on')->orderBy('id')->lockForUpdate()->first();
                if ($batchId && ! $batch) {
                    throw ValidationException::withMessages(['cylinder_batch_id' => 'That batch is not for this product.']);
                }
                if ($batch && $batchId && $qty > (int) $batch->quantity_remaining) {
                    throw ValidationException::withMessages(['quantity' => "Batch {$batch->batch_code} has only {$batch->quantity_remaining} cylinder(s) left."]);
                }
                if ($batch) {
                    $batch->decrement('quantity_remaining', min($qty, (int) $batch->quantity_remaining));
                }
                $inventory->decrement('quantity', $qty);
            } else {
                $inventory->decrement('empty_quantity', $qty);
            }
            $inventory->increment('damaged_quantity', $qty);
            StockService::reconcileBatches($product->id);

            InventoryTransaction::create([
                'product_id' => $product->id, 'type' => $reason === 'expired' ? 'expired' : 'damaged', 'quantity' => $qty,
                'reference' => $batch?->batch_code, 'user_id' => $userId,
                'notes' => ($wasEmpty ? 'Empty cylinder(s) ' : 'Filled cylinder(s) ') . strtolower(CylinderIncident::REASONS[$reason]) . ' — held aside' . ($note ? ": {$note}" : ''),
            ]);

            return CylinderIncident::create([
                'store_id' => $product->store_id, 'product_id' => $product->id, 'cylinder_batch_id' => $batch?->id,
                'supplier_id' => $batch?->supplier_id, 'quantity' => $qty, 'reason' => $reason, 'source' => $source, 'was_empty' => $wasEmpty,
                'note' => $note, 'photo_path' => $path, 'status' => 'held', 'recorded_by' => $userId,
            ]);
        });

        // Less usable stock → maybe time to reorder
        ReorderService::checkProduct($product->fresh());

        return $incident;
    }

    /** "Mark as expired" from the batch drawer: the whole remaining quantity of the batch. */
    public static function markBatchExpired(CylinderBatch $batch, ?int $userId): CylinderIncident
    {
        if ((int) $batch->quantity_remaining < 1) {
            throw ValidationException::withMessages(['batch' => 'Nothing left in this batch.']);
        }

        return static::record($batch->product, (int) $batch->quantity_remaining, 'expired', $batch->id,
            "Batch {$batch->batch_code} past its requalification date", null, false, $userId);
    }

    // ── Supplier returns ─────────────────────────────────────────────────────

    /** "RT-000001" — per-store series (store row locked). Call inside a transaction. */
    public static function nextReturnNumber(int $storeId): string
    {
        $store = Store::withTrashed()->whereKey($storeId)->lockForUpdate()->firstOrFail();
        $n = max(1, (int) $store->return_next_number);
        $store->forceFill(['return_next_number' => $n + 1])->save();

        return 'RT-' . str_pad((string) $n, 6, '0', STR_PAD_LEFT);
    }

    /** Group held incidents of this store into one return to a supplier. */
    public static function createReturn(Store $store, Supplier $supplier, array $incidentIds, ?string $notes, ?int $userId): SupplierReturn
    {
        abort_unless($supplier->store_id === $store->id, 403);

        return DB::transaction(function () use ($store, $supplier, $incidentIds, $notes, $userId) {
            $incidents = CylinderIncident::where('store_id', $store->id)->whereIn('id', $incidentIds)->lockForUpdate()->get();
            if ($incidents->isEmpty() || $incidents->contains(fn ($i) => $i->status !== 'held' || $i->source === 'customer_handover')) {
                throw ValidationException::withMessages(['incident_ids' => 'Choose damaged cylinders that are still held (customer tanks refused at handover are not ours to return).']);
            }
            $return = SupplierReturn::create(['store_id' => $store->id, 'supplier_id' => $supplier->id, 'return_number' => static::nextReturnNumber($store->id),
                'status' => 'sent', 'notes' => $notes, 'created_by' => $userId]);
            CylinderIncident::whereIn('id', $incidents->pluck('id'))->update(['status' => 'returned', 'supplier_return_id' => $return->id, 'supplier_id' => $supplier->id]);
            foreach ($incidents->groupBy('product_id') as $productId => $group) {
                InventoryTransaction::create(['product_id' => $productId, 'type' => 'returned_to_supplier', 'quantity' => (int) $group->sum('quantity'),
                    'reference' => $return->return_number, 'notes' => "Damaged cylinder(s) sent back to {$supplier->name}", 'user_id' => $userId]);
            }

            return $return->fresh('incidents');
        });
    }

    /**
     * The supplier's answer. replaced: $data = requalification_due_on (required), manufactured_on, batch_code;
     * credited: $data = credited_amount; rejected: back to 'held' (still damaged — dispose it after).
     */
    public static function outcome(SupplierReturn $return, string $outcome, array $data, ?int $userId): SupplierReturn
    {
        if (! in_array($return->status, ['open', 'sent'], true)) {
            throw ValidationException::withMessages(['status' => 'This return was already settled.']);
        }

        DB::transaction(function () use ($return, $outcome, $data, $userId) {
            $incidents = CylinderIncident::with('product')->where('supplier_return_id', $return->id)->lockForUpdate()->get();
            foreach ($incidents->groupBy('product_id') as $productId => $group) {
                $qty = (int) $group->sum('quantity');
                $product = $group->first()->product;
                if ($outcome === 'replaced') {
                    if (empty($data['requalification_due_on'])) {
                        throw ValidationException::withMessages(['requalification_due_on' => 'Enter the requalification date of the replacement cylinders.']);
                    }
                    static::takeOutOfDamaged((int) $productId, $qty);
                    StockService::receive($product, $qty, ['supplier_id' => $return->supplier_id, 'source' => 'return',
                        'requalification_due_on' => $data['requalification_due_on'], 'manufactured_on' => $data['manufactured_on'] ?? null,
                        'batch_code' => $data['batch_code'] ?? null], $userId, $return->return_number, 'Replacement from the supplier (return)');
                } elseif ($outcome === 'credited') {
                    static::takeOutOfDamaged((int) $productId, $qty);
                    InventoryTransaction::create(['product_id' => $productId, 'type' => 'out', 'quantity' => $qty, 'reference' => $return->return_number,
                        'notes' => 'Damaged cylinder(s) credited by the supplier — ₱' . number_format((float) ($data['credited_amount'] ?? 0), 2), 'user_id' => $userId]);
                }
            }
            $status = ['replaced' => 'replaced', 'credited' => 'credited', 'rejected' => 'held'][$outcome]
                ?? throw ValidationException::withMessages(['outcome' => 'Choose replaced, credited or rejected.']);
            CylinderIncident::where('supplier_return_id', $return->id)->update(['status' => $status]);
            $return->update(['status' => $outcome, 'credited_amount' => $outcome === 'credited' ? round((float) ($data['credited_amount'] ?? 0), 2) : null]);
        });

        return $return->fresh('incidents');
    }

    /** Dispose of held cylinders (e.g. after a rejected return): damaged −qty, transaction 'out'. */
    public static function dispose(CylinderIncident $incident, ?int $userId): void
    {
        if ($incident->status !== 'held' || $incident->source === 'customer_handover') {
            throw ValidationException::withMessages(['status' => 'Only held cylinders can be disposed of.']);
        }
        DB::transaction(function () use ($incident, $userId) {
            static::takeOutOfDamaged($incident->product_id, (int) $incident->quantity);
            InventoryTransaction::create(['product_id' => $incident->product_id, 'type' => 'out', 'quantity' => $incident->quantity,
                'reference' => $incident->supplierReturn?->return_number, 'notes' => 'Damaged cylinder(s) disposed', 'user_id' => $userId]);
            $incident->update(['status' => 'disposed']);
        });
    }

    private static function takeOutOfDamaged(int $productId, int $qty): void
    {
        $inv = Inventory::where('product_id', $productId)->lockForUpdate()->first();
        if ($inv) {
            $inv->update(['damaged_quantity' => max(0, (int) $inv->damaged_quantity - $qty)]);
        }
    }

    public static function returnSlipPdf(SupplierReturn $return): string
    {
        $return->loadMissing(['supplier', 'store', 'incidents.product', 'incidents.batch']);

        return PurchaseOrderService::renderPdf('pdf.supplier-return', ['ret' => $return, 'store' => $return->store, 'logo' => PurchaseOrderService::logo($return->store)]);
    }
}
