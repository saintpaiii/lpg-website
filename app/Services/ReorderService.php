<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Store;
use App\Models\SupplierProduct;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * J7 Part E — auto-reorder. The DSS DRAFTS a purchase order; a person with inventory.po_send approves (sends) it.
 *
 *  avg_daily      = units sold in the last 30 days (orders not cancelled) ÷ 30
 *  lead           = the preferred supplier's lead time (no supplier → config default)
 *  safety_stock   = ceil(avg_daily × safety_days)
 *  reorder_point  = max(manual reorder level, ceil(avg_daily × lead) + safety_stock)
 *  target_stock   = reorder_point + max(ceil(avg_daily × cover_days), 1)      ("order up to" level — K6)
 *  suggested_qty  = max(min_order_qty, target_stock − usable_filled − already_on_order), rounded UP to a multiple of
 *                   min_order_qty. Due only when usable + on_order ≤ reorder_point, so receiving it lifts stock above
 *                   the reorder point (no re-trigger).
 * usable_filled excludes expired batches; already_on_order = remaining qty of sent / partially received POs.
 */
class ReorderService
{
    /** Pure: the numbers + the sentence shown in the UI. */
    public static function compute(float $avgDaily, int $lead, int $usable, int $onOrder, int $minOrder, int $manualLevel, ?array $cfg = null): array
    {
        $cfg ??= config('inventory.reorder');
        $safety = (int) ceil($avgDaily * (int) $cfg['safety_days']);
        $point  = (int) ceil($avgDaily * $lead) + $safety;
        $pointSource = 'formula';
        if ($manualLevel > $point) {
            $point = $manualLevel;
            $pointSource = 'manual';
        }
        $min    = max(1, $minOrder);
        $target = $point + max((int) ceil($avgDaily * (int) $cfg['cover_days']), 1);   // K6: "order up to" level
        $qty    = max($min, $target - $usable - $onOrder);
        $qty    = (int) (ceil($qty / $min) * $min);
        $due    = $usable + $onOrder <= $point;

        $text = 'Sold ' . rtrim(rtrim(number_format($avgDaily, 1, '.', ''), '0'), '.') . "/day · lead {$lead} " . ($lead === 1 ? 'day' : 'days')
            . " · safety {$safety} → reorder at {$point}" . ($pointSource === 'manual' ? ' (your reorder level)' : '') . ", order up to {$target}"
            . "; you have {$usable}" . ($onOrder ? " + {$onOrder} on order" : '') . ($due ? " → order {$qty}" : ' → no order needed yet');

        return ['avg_daily' => round($avgDaily, 2), 'lead' => $lead, 'safety_stock' => $safety, 'reorder_point' => $point, 'point_source' => $pointSource,
            'target_stock' => $target, 'usable' => $usable, 'on_order' => $onOrder, 'min_order_qty' => $min, 'suggested_qty' => $qty, 'due' => $due, 'text' => $text];
    }

    /** Units sold in the last N days (not cancelled) — the same query the DSS reorder alerts use. */
    public static function avgDaily(Product $product): float
    {
        $days = (int) config('inventory.reorder.sales_days', 30);
        $sold = (int) OrderItem::whereHas('order', fn ($q) => $q->where('store_id', $product->store_id)->where('status', '!=', 'cancelled')
            ->where('created_at', '>=', now()->subDays($days)))->where('product_id', $product->id)->sum('quantity');

        return $sold / max(1, $days);
    }

    public static function onOrder(int $productId): int
    {
        return (int) PurchaseOrderItem::where('product_id', $productId)
            ->whereHas('purchaseOrder', fn ($q) => $q->whereIn('status', PurchaseOrder::OPEN_STATUSES))
            ->get()->sum(fn ($i) => $i->remaining());
    }

    /** All the numbers for one product (+ its preferred supplier link). */
    public static function forProduct(Product $product): array
    {
        $pref = PurchaseOrderService::preferredFor($product->id);
        $inv  = $product->relationLoaded('inventory') ? $product->inventory : Inventory::where('product_id', $product->id)->first();
        $calc = static::compute(
            static::avgDaily($product),
            (int) ($pref?->supplier?->lead_time_days ?? config('inventory.reorder.default_lead_days', 2)),
            StockService::usableFilled($product->id, $inv),
            static::onOrder($product->id),
            (int) ($pref?->min_order_qty ?? 1),
            (int) ($inv?->reorder_level ?? 0),
        );

        return $calc + ['product_id' => $product->id, 'supplier_id' => $pref?->supplier_id, 'supplier_name' => $pref?->supplier?->name,
            'unit_cost' => $pref ? (float) $pref->unit_cost : (float) $product->cost_price];
    }

    /** After a confirm / damaged record: check this product (and its supplier's other products). */
    public static function checkProduct(Product $product): ?PurchaseOrder
    {
        $store = Store::find($product->store_id);
        if (! $store || ! $store->auto_reorder_enabled || $product->exclude_auto_reorder) {
            return null;
        }
        $pref = PurchaseOrderService::preferredFor($product->id);
        if (! $pref || ! static::forProduct($product)['due']) {
            return null;
        }

        return static::draftForSupplier($store, $pref->supplier_id);
    }

    /** Daily command: every store with auto-reorder on, one draft per supplier at most. Returns the drafts touched. */
    public static function checkStore(Store $store): array
    {
        if (! $store->auto_reorder_enabled) {
            return [];
        }
        $supplierIds = SupplierProduct::where('is_preferred', true)->whereHas('product', fn ($q) => $q->where('store_id', $store->id))
            ->distinct()->pluck('supplier_id');

        return $supplierIds->map(fn ($sid) => static::draftForSupplier($store, (int) $sid))->filter()->values()->all();
    }

    /**
     * ONE open auto draft per supplier: every product of theirs (preferred) at / below its reorder point gets a line
     * (existing lines are updated, never duplicated). Never sent automatically.
     */
    public static function draftForSupplier(Store $store, int $supplierId): ?PurchaseOrder
    {
        $links = SupplierProduct::with(['product.inventory', 'supplier'])->where('supplier_id', $supplierId)->where('is_preferred', true)
            ->whereHas('product', fn ($q) => $q->where('store_id', $store->id)->where('is_active', true)->where('exclude_auto_reorder', false))->get();
        $due = $links->map(fn ($l) => ['link' => $l, 'calc' => static::forProduct($l->product)])->filter(fn ($x) => $x['calc']['due'])->values();
        if ($due->isEmpty() || ! $links->first()?->supplier?->is_active) {
            return null;
        }

        [$po, $created, $added] = DB::transaction(function () use ($store, $supplierId, $due) {
            $po = PurchaseOrder::where('store_id', $store->id)->where('supplier_id', $supplierId)->where('status', 'draft')
                ->where('source', 'auto')->lockForUpdate()->first();
            $created = false;
            if (! $po) {
                $po = PurchaseOrder::create(['store_id' => $store->id, 'supplier_id' => $supplierId, 'po_number' => PurchaseOrderService::nextNumber($store->id),
                    'status' => 'draft', 'source' => 'auto', 'notes' => 'Drafted by the DSS auto-reorder — review and send.']);
                $created = true;
            }
            $added = 0;
            foreach ($due as $x) {
                $qty = $x['calc']['suggested_qty'];
                $cost = (float) $x['link']->unit_cost;
                $line = PurchaseOrderItem::where('purchase_order_id', $po->id)->where('product_id', $x['link']->product_id)->first();
                if ($line) {
                    $line->update(['quantity_ordered' => $qty, 'unit_cost' => $cost, 'line_total' => round($qty * $cost, 2)]);
                } else {
                    PurchaseOrderItem::create(['purchase_order_id' => $po->id, 'product_id' => $x['link']->product_id, 'quantity_ordered' => $qty,
                        'unit_cost' => $cost, 'line_total' => round($qty * $cost, 2)]);
                    $added++;
                }
            }
            $po->recalcSubtotal();

            return [$po->fresh(['items', 'supplier']), $created, $added];
        });

        if ($created || $added) {
            $msg = "Auto-reorder draft {$po->po_number} for {$po->supplier?->name} ({$po->items->count()} item" . ($po->items->count() === 1 ? '' : 's') . ') is ready for review.';
            foreach (static::approverIds($store) as $uid) {
                NotificationService::send($uid, 'purchase_order', 'Auto-reorder draft ready', $msg, ['link' => "/seller/purchase-orders/{$po->id}"]);
            }
        }

        return $po;
    }

    /** The owner + staff who can send purchase orders (inventory.po_send). */
    public static function approverIds(Store $store): array
    {
        $ids = [(int) $store->user_id];
        foreach (User::where('store_id', $store->id)->where('role', 'seller_staff')->where('is_active', true)->get() as $u) {
            if (StaffAccess::can($u, 'inventory.po_send')) {
                $ids[] = $u->id;
            }
        }

        return array_values(array_unique($ids));
    }

    /** DSS alert: active LPG/accessory products with no supplier at all ("add one to enable auto-reorder"). */
    public static function productsWithoutSupplier(Store $store): array
    {
        return Product::where('store_id', $store->id)->where('is_active', true)->where('exclude_auto_reorder', false)
            ->whereDoesntHave('supplierProducts')->orderBy('name')->get(['id', 'name'])
            ->map(fn ($p) => ['product_id' => $p->id, 'name' => $p->name, 'text' => "No supplier set for {$p->name} — add one to enable auto-reorder."])->all();
    }
}
