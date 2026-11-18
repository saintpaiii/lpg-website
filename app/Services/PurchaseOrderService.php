<?php

namespace App\Services;

use App\Mail\PurchaseOrderMail;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\User;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * J7 — purchase orders: draft → sent (PDF emailed to the supplier, or just marked sent) → partially_received → received.
 * Cancel only before anything was received. Receiving puts stock in (cylinder batches for LPG), hands empties to the
 * supplier and updates the product's cost price to the latest unit cost (the PO lines are the purchase history).
 */
class PurchaseOrderService
{
    /** "PO-000001" — per-store series, store row locked (same pattern as invoice numbers). Call inside a transaction. */
    public static function nextNumber(int $storeId): string
    {
        $store = Store::withTrashed()->whereKey($storeId)->lockForUpdate()->firstOrFail();
        $n = max(1, (int) $store->po_next_number);
        $store->forceFill(['po_next_number' => $n + 1])->save();

        return 'PO-' . str_pad((string) $n, 6, '0', STR_PAD_LEFT);
    }

    /**
     * New draft PO. $lines: [['product_id' => 1, 'quantity' => 10, 'unit_cost' => 700.0], …] — products of this store.
     */
    public static function createDraft(Store $store, Supplier $supplier, array $lines, ?int $userId, string $source = 'manual', ?string $notes = null, ?string $expectedOn = null): PurchaseOrder
    {
        abort_unless($supplier->store_id === $store->id, 403);

        return DB::transaction(function () use ($store, $supplier, $lines, $userId, $source, $notes, $expectedOn) {
            $po = PurchaseOrder::create([
                'store_id' => $store->id, 'supplier_id' => $supplier->id, 'po_number' => static::nextNumber($store->id),
                'status' => 'draft', 'source' => $source, 'notes' => $notes, 'expected_on' => $expectedOn, 'created_by' => $userId,
            ]);
            static::syncLines($po, $lines);

            return $po->fresh('items');
        });
    }

    /** Replace a draft's lines (and notes / expected date). */
    public static function updateDraft(PurchaseOrder $po, array $lines, ?string $notes, ?string $expectedOn): PurchaseOrder
    {
        if ($po->status !== 'draft') {
            throw ValidationException::withMessages(['status' => 'Only a draft purchase order can be edited.']);
        }
        DB::transaction(function () use ($po, $lines, $notes, $expectedOn) {
            $po->update(['notes' => $notes, 'expected_on' => $expectedOn]);
            $po->items()->delete();
            static::syncLines($po, $lines);
        });

        return $po->fresh('items');
    }

    private static function syncLines(PurchaseOrder $po, array $lines): void
    {
        $products = Product::where('store_id', $po->store_id)->whereIn('id', array_column($lines, 'product_id'))->pluck('id')->all();
        $merged = [];
        foreach ($lines as $l) {
            $pid = (int) ($l['product_id'] ?? 0);
            $qty = (int) ($l['quantity'] ?? 0);
            if ($qty <= 0 || ! in_array($pid, $products, true)) {
                continue;
            }
            $merged[$pid] = ['qty' => ($merged[$pid]['qty'] ?? 0) + $qty, 'cost' => round((float) ($l['unit_cost'] ?? 0), 2)];
        }
        if (! $merged) {
            throw ValidationException::withMessages(['lines' => 'Add at least one product with a quantity.']);
        }
        foreach ($merged as $pid => $l) {
            PurchaseOrderItem::create(['purchase_order_id' => $po->id, 'product_id' => $pid, 'quantity_ordered' => $l['qty'],
                'unit_cost' => $l['cost'], 'line_total' => round($l['qty'] * $l['cost'], 2)]);
        }
        $po->recalcSubtotal();
    }

    /**
     * Send: status sent + expected date (lead time), the PDF emailed to the supplier when they have an email address.
     * Returns 'emailed' | 'marked_sent'.
     */
    public static function send(PurchaseOrder $po, User $by): string
    {
        if ($po->status !== 'draft') {
            throw ValidationException::withMessages(['status' => 'This purchase order was already sent.']);
        }
        $po->loadMissing(['supplier', 'items.product', 'store']);
        if ($po->items->isEmpty()) {
            throw ValidationException::withMessages(['lines' => 'Add at least one product first.']);
        }
        // K6: the supplier's minimum order quantity — a draft may be below it, sending isn't allowed
        if ($below = static::belowMinimum($po)) {
            throw ValidationException::withMessages(['lines' => collect($below)->map(fn ($b) => "{$b['name']}: the minimum order from {$po->supplier?->name} is {$b['min']} (this PO has {$b['qty']}).")->implode(' ')]);
        }
        $po->update([
            'status' => 'sent', 'sent_at' => now(), 'sent_by' => $by->id,
            'expected_on' => $po->expected_on ?? now()->addDays((int) ($po->supplier?->lead_time_days ?? 2))->toDateString(),
        ]);

        $result = 'marked_sent';
        if ($email = $po->supplier?->email) {
            try {
                Mail::to($email)->send(new PurchaseOrderMail($po->fresh(['supplier', 'items.product', 'store']), static::pdf($po)));
                $result = 'emailed';
            } catch (\Throwable $e) {
                Log::warning('Purchase order email failed', ['po' => $po->po_number, 'error' => $e->getMessage()]);
                $result = 'email_failed';
            }
        }

        if ($po->created_by && $po->created_by !== $by->id) {
            NotificationService::send($po->created_by, 'purchase_order', "Purchase order {$po->po_number} sent",
                "{$by->name} sent {$po->po_number} to {$po->supplier?->name}.", ['link' => "/seller/purchase-orders/{$po->id}"]);
        }

        return $result;
    }

    /**
     * K6: lines below the supplier's min_order_qty (supplier_products of this PO's supplier).
     *
     * @return array<int, array{name: string, qty: int, min: int}>  keyed by purchase_order_item id
     */
    public static function belowMinimum(PurchaseOrder $po): array
    {
        $po->loadMissing('items.product');
        $mins = SupplierProduct::where('supplier_id', $po->supplier_id)->whereIn('product_id', $po->items->pluck('product_id'))->pluck('min_order_qty', 'product_id');
        $out = [];
        foreach ($po->items as $item) {
            $min = (int) ($mins[$item->product_id] ?? 1);
            if ($min > 1 && (int) $item->quantity_ordered < $min) {
                $out[$item->id] = ['name' => $item->product?->name ?? 'A product', 'qty' => (int) $item->quantity_ordered, 'min' => $min];
            }
        }

        return $out;
    }

    public static function cancel(PurchaseOrder $po): void
    {
        $po->loadMissing('items');
        if (in_array($po->status, ['received', 'cancelled'], true) || $po->anyReceived()) {
            throw ValidationException::withMessages(['status' => 'A purchase order can only be cancelled before anything is received.']);
        }
        $po->update(['status' => 'cancelled']);
    }

    /**
     * Receive (part of) a delivery — ONE transaction. $rows keyed by purchase_order_item id:
     *   quantity, requalification_due_on (LPG: required), manufactured_on, batch_code, empties_sent (≤ empties in stock).
     */
    public static function receive(PurchaseOrder $po, array $rows, User $by): PurchaseOrder
    {
        if (! in_array($po->status, ['sent', 'partially_received'], true)) {
            throw ValidationException::withMessages(['status' => 'Send the purchase order before receiving it.']);
        }

        DB::transaction(function () use ($po, $rows, $by) {
            $po = PurchaseOrder::whereKey($po->id)->lockForUpdate()->first();
            $items = PurchaseOrderItem::with('product')->where('purchase_order_id', $po->id)->get()->keyBy('id');
            $any = false;
            foreach ($rows as $itemId => $row) {
                $item = $items->get((int) $itemId);
                $qty = (int) ($row['quantity'] ?? 0);
                $empties = (int) ($row['empties_sent'] ?? 0);
                if (! $item || ($qty <= 0 && $empties <= 0)) {
                    continue;
                }
                if ($qty > $item->remaining()) {
                    throw ValidationException::withMessages(["rows.{$itemId}.quantity" => "Only {$item->remaining()} left to receive for {$item->product?->name}."]);
                }
                $product = $item->product;
                if ($qty > 0) {
                    StockService::requireBatchDates($product, $row, "rows.{$itemId}.");
                    StockService::receive($product, $qty, [
                        'purchase_order_item_id' => $item->id, 'supplier_id' => $po->supplier_id, 'source' => 'po',
                        'requalification_due_on' => $row['requalification_due_on'] ?? null, 'manufactured_on' => $row['manufactured_on'] ?? null,
                        'batch_code' => $row['batch_code'] ?? null,
                    ], $by->id, $po->po_number, "Received from {$po->supplier?->name}");
                    // Latest unit cost becomes the product's cost price (the PO lines keep the history)
                    $product->update(['cost_price' => $item->unit_cost]);
                    $item->increment('quantity_received', $qty);
                }
                if ($empties > 0) {
                    $available = (int) ($product->inventory?->empty_quantity ?? 0);
                    if ($empties > $available) {
                        throw ValidationException::withMessages(["rows.{$itemId}.empties_sent" => "You only have {$available} empty {$product->name} cylinder(s)."]);
                    }
                    StockService::emptiesOut($product->id, $empties, $by->id, $po->po_number, "Empties handed to {$po->supplier?->name} (refill swap)");
                    $item->increment('empties_sent', $empties);
                }
                $any = true;
            }
            if (! $any) {
                throw ValidationException::withMessages(['rows' => 'Enter a quantity received (or empties handed over) for at least one line.']);
            }
            $done = PurchaseOrderItem::where('purchase_order_id', $po->id)->get()->every(fn ($i) => $i->remaining() === 0);
            $po->update(['status' => $done ? 'received' : 'partially_received', 'received_at' => $done ? now() : $po->received_at]);
        });

        $po = $po->fresh(['supplier', 'items.product']);
        SupplierPaymentService::afterReceive($po);   // K6: due date (first receive) + payment status (owed grew)
        NotificationService::send((int) Store::whereKey($po->store_id)->value('user_id'), 'purchase_order',
            "Purchase order {$po->po_number} " . ($po->status === 'received' ? 'received' : 'partly received'),
            "{$by->name} received stock from {$po->supplier?->name} ({$po->po_number}).", ['link' => "/seller/purchase-orders/{$po->id}"]);

        return $po;
    }

    // ── PDF ──────────────────────────────────────────────────────────────────

    public static function pdf(PurchaseOrder $po): string
    {
        $po->loadMissing(['supplier', 'items.product', 'store', 'creator']);

        return static::renderPdf('pdf.purchase-order', ['po' => $po, 'store' => $po->store, 'logo' => static::logo($po->store)]);
    }

    /** Store logo as base64 (local storage only, like the invoice PDF). */
    public static function logo(?Store $store): ?string
    {
        $path = $store?->logo;
        if ($path && Storage::disk('public')->exists($path)) {
            $mime = Storage::disk('public')->mimeType($path) ?: 'image/png';
            if (in_array($mime, ['image/png', 'image/jpeg'], true)) {
                return "data:{$mime};base64," . base64_encode(Storage::disk('public')->get($path));
            }
        }

        return null;
    }

    public static function renderPdf(string $view, array $data): string
    {
        $options = new Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');
        $dompdf = new Dompdf($options);
        $dompdf->loadHtml(view($view, $data)->render(), 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    // ── Suppliers ────────────────────────────────────────────────────────────

    /** One preferred supplier per product: making this link preferred clears the others. */
    public static function setPreferred(SupplierProduct $link): void
    {
        DB::transaction(function () use ($link) {
            SupplierProduct::where('product_id', $link->product_id)->where('id', '!=', $link->id)->update(['is_preferred' => false]);
            $link->update(['is_preferred' => true]);
        });
    }

    public static function preferredFor(int $productId): ?SupplierProduct
    {
        return SupplierProduct::with('supplier')->where('product_id', $productId)->where('is_preferred', true)
            ->whereHas('supplier', fn ($q) => $q->where('is_active', true))->first();
    }
}
