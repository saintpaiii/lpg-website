<?php

namespace App\Services;

use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\Supplier;

/**
 * J7 Part D4 — DSS "Suppliers & Cylinders" (rule-based; thresholds in config('inventory.dss'); last 90 days).
 * Damage rates only count the STORE'S cylinders (stock checks / deliveries) — customer tanks refused at handover (J4)
 * are a separate stat and never in a supplier's rate.
 */
class SupplierDssService
{
    public static function forStore(Store $store, ?array $cfg = null): array
    {
        $cfg ??= config('inventory.dss');
        $since = now()->subDays((int) $cfg['days']);

        $suppliers = Supplier::where('store_id', $store->id)->orderBy('name')->get()->map(function (Supplier $s) use ($since) {
            $received = (int) CylinderBatch::where('supplier_id', $s->id)->where('source', 'po')->whereDate('received_on', '>=', $since->toDateString())->sum('quantity_received');
            $incidents = CylinderIncident::with('product')->where('supplier_id', $s->id)->where('source', '!=', 'customer_handover')->where('created_at', '>=', $since)->get();
            $pos = PurchaseOrder::where('supplier_id', $s->id)->whereNotNull('sent_at')->whereNotNull('received_at')->where('received_at', '>=', $since)->get();
            $delays = $pos->map(fn ($po) => (int) $po->sent_at->copy()->startOfDay()->addDays((int) $s->lead_time_days)
                ->diffInDays($po->received_at->copy()->startOfDay(), false));

            return [
                'id'           => $s->id,
                'name'         => $s->name,
                'lead_days'    => (int) $s->lead_time_days,
                'received'     => $received,
                'damaged'      => (int) $incidents->sum('quantity'),
                'by_product'   => $incidents->groupBy('product_id')->map(fn ($g) => ['product_id' => (int) $g->first()->product_id, 'name' => $g->first()->product?->name, 'qty' => (int) $g->sum('quantity')])->values()->all(),
                'products'     => $s->products()->pluck('product_id')->map(fn ($id) => (int) $id)->all(),
                'pos_received' => $pos->count(),
                'avg_delay'    => $delays->isEmpty() ? null : round($delays->avg(), 1),
                'on_time_pct'  => $delays->isEmpty() ? null : (int) round($delays->filter(fn ($d) => $d <= 0)->count() / $delays->count() * 100),
            ];
        })->values()->all();

        $suppliers = static::advise($suppliers, $cfg);

        // Expiry: filled cylinders reaching their requalification date within N days (not yet expired)
        $soon = CylinderBatch::with('product')->where('store_id', $store->id)->where('quantity_remaining', '>', 0)
            ->whereDate('requalification_due_on', '>=', now()->toDateString())
            ->whereDate('requalification_due_on', '<=', now()->addDays((int) $cfg['expiry_soon_days'])->toDateString())->orderBy('requalification_due_on')->get();
        $expiry = $soon->isEmpty() ? null : [
            'qty'  => (int) $soon->sum('quantity_remaining'),
            'text' => $soon->sum('quantity_remaining') . " cylinder(s) expire within {$cfg['expiry_soon_days']} days (batch " . $soon->pluck('batch_code')->take(3)->implode(', ')
                . ($soon->count() > 3 ? '…' : '') . ') — sell first or prepare requalification / return.',
        ];

        // Per product (brand / size) damage, store cylinders only
        $byProduct = CylinderIncident::with('product')->where('store_id', $store->id)->where('source', '!=', 'customer_handover')->where('created_at', '>=', $since)->get()
            ->groupBy('product_id')->map(function ($g) use ($cfg) {
                $reason = $g->groupBy('reason')->map->sum('quantity')->sortDesc()->keys()->first();

                return ['name' => $g->first()->product?->name, 'qty' => (int) $g->sum('quantity'), 'reason' => $reason,
                    'text' => "{$g->first()->product?->name}: " . $g->sum('quantity') . ' ' . strtolower(CylinderIncident::REASONS[$reason] ?? $reason) . " in {$cfg['days']} days"];
            })->sortByDesc('qty')->values()->all();

        // Customer tanks refused at handover (J4) — separate, not a supplier problem
        $handover = CylinderIncident::with('product')->where('store_id', $store->id)->where('source', 'customer_handover')->where('created_at', '>=', $since)->get();
        $handoverStat = $handover->isEmpty() ? null : (function () use ($handover, $cfg) {
            $reason = $handover->groupBy('reason')->map->sum('quantity')->sortDesc()->keys()->first();
            $product = $handover->groupBy('product_id')->map->sum('quantity')->sortDesc()->keys()->first();
            $name = $handover->firstWhere('product_id', $product)?->product?->name;

            return ['qty' => (int) $handover->sum('quantity'),
                'text' => "Customer tanks rejected at handover ({$cfg['days']} days): {$handover->sum('quantity')}, mostly " . strtolower(CylinderIncident::REASONS[$reason] ?? $reason) . ($name ? " {$name}" : '')];
        })();

        // Empties to send back
        $empties = Inventory::with('product')->whereHas('product', fn ($q) => $q->where('store_id', $store->id))->where('empty_quantity', '>=', (int) $cfg['empties_min'])->get()
            ->map(fn ($i) => ['product_id' => $i->product_id, 'qty' => (int) $i->empty_quantity,
                'text' => "You hold {$i->empty_quantity} empty {$i->product?->name} cylinders — send them with your next refill PO."])->values()->all();

        return [
            'days'          => (int) $cfg['days'],
            'thresholds'    => $cfg,
            'suppliers'     => $suppliers,
            'expiry'        => $expiry,
            'by_product'    => $byProduct,
            'handover'      => $handoverStat,
            'empties'       => $empties,
            'no_supplier'   => ReorderService::productsWithoutSupplier($store),
        ];
    }

    /**
     * Pure: damage rate + advice per supplier.
     *   rate ≥ switch_rate and another supplier of the same product is lower → "Consider switching to Y (damage rate 1.2%) for 11kg"
     *   rate ≥ inspect_rate → "Inspect every delivery from X / ask for replacement"
     *   late % ≥ late_pct → "Order N days earlier from X"
     *   else "No issues"
     */
    public static function advise(array $suppliers, array $cfg): array
    {
        foreach ($suppliers as &$s) {
            $s['damage_rate'] = $s['received'] >= (int) $cfg['min_received'] ? round($s['damaged'] / max(1, $s['received']) * 100, 1) : null;
        }
        unset($s);

        foreach ($suppliers as &$s) {
            $advice = [];
            $rate = $s['damage_rate'];
            if ($rate !== null && $rate >= (float) $cfg['switch_rate']) {
                // Same product from someone better
                foreach ($s['by_product'] as $p) {
                    $alt = collect($suppliers)->filter(fn ($o) => $o['id'] !== $s['id'] && in_array($p['product_id'], $o['products'], true) && $o['damage_rate'] !== null && $o['damage_rate'] < $rate)
                        ->sortBy('damage_rate')->first();
                    if ($alt) {
                        $advice[] = "Consider switching to {$alt['name']} (damage rate {$alt['damage_rate']}%) for {$p['name']}.";
                    }
                }
                if (! $advice) {
                    $advice[] = "Damage rate {$rate}% — inspect every delivery from {$s['name']} and ask for replacements; look for another supplier.";
                }
            } elseif ($rate !== null && $rate >= (float) $cfg['inspect_rate']) {
                $advice[] = "Inspect every delivery from {$s['name']} / ask for replacement (damage rate {$rate}%).";
            }
            if ($s['on_time_pct'] !== null && (100 - $s['on_time_pct']) >= (int) $cfg['late_pct'] && $s['avg_delay'] > 0) {
                $days = (int) ceil($s['avg_delay']);
                $advice[] = "Order {$days} " . ($days === 1 ? 'day' : 'days') . " earlier from {$s['name']} (on time {$s['on_time_pct']}%, average {$s['avg_delay']} days late).";
            }
            $s['advice'] = $advice ?: ['No issues.'];
            $s['ok'] = ! $advice;
        }
        unset($s);

        return $suppliers;
    }
}
