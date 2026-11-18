<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\CylinderBatch;
use App\Models\CylinderIncident;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\SupplierReturn;
use App\Services\CylinderService;
use App\Services\ReorderService;
use App\Services\StockService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InventoryController extends Controller
{
    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $tab   = $request->input('tab', 'overview');

        $productList = Product::where('store_id', $store->id)
            ->orderBy('name')
            ->get(['id', 'name', 'brand']);

        if ($tab === 'transactions') {
            $query = InventoryTransaction::with([
                'product' => fn ($q) => $q->withTrashed(),
                'user',
            ])->whereHas('product', fn ($q) => $q->withTrashed()->where('store_id', $store->id))
              ->latest();

            if ($productId = $request->input('product_id')) {
                $query->where('product_id', $productId);
            }

            if ($type = $request->input('type')) {
                $query->where('type', $type);
            }

            if ($dateFrom = $request->input('date_from')) {
                $query->whereDate('created_at', '>=', $dateFrom);
            }

            if ($dateTo = $request->input('date_to')) {
                $query->whereDate('created_at', '<=', $dateTo);
            }

            $transactions = $query->paginate(20)->withQueryString()
                ->through(fn ($t) => [
                    'id'         => $t->id,
                    'type'       => $t->type,
                    'quantity'   => $t->quantity,
                    'reference'  => $t->reference,
                    'notes'      => $t->notes,
                    'created_at' => $t->created_at->format('M d, Y g:i A'),
                    'product'    => $t->product ? ['id' => $t->product->id, 'name' => $t->product->name, 'brand' => $t->product->brand] : null,
                    'user'       => $t->user ? ['name' => $t->user->name] : null,
                ]);

            return Inertia::render('seller/inventory', [
                'tab'          => 'transactions',
                'transactions' => $transactions,
                'productList'  => $productList,
                'filters'      => (object) $request->only('product_id', 'type', 'date_from', 'date_to', 'tab'),
            ]);
        }

        // Stock overview
        $search = $request->input('search');

        $query = Inventory::with('product')
            ->whereHas('product', fn ($q) => $q->where('store_id', $store->id));

        if ($search) {
            $query->whereHas('product', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('brand', 'like', "%{$search}%");
            });
        }

        $inventories = $query
            ->join('products', 'inventories.product_id', '=', 'products.id')
            ->orderBy('products.name')
            ->select('inventories.*')
            ->paginate(20)->withQueryString()
            ->through(fn ($i) => static::row($i));

        return Inertia::render('seller/inventory', [
            'tab'         => 'overview',
            'inventories' => $inventories,
            'productList' => $productList,
            'filters'     => (object) $request->only('search', 'tab', 'batches'),
            // J7: damaged / expired cylinders held aside + supplier returns
            'incidents'   => CylinderIncident::with(['product:id,name', 'batch:id,batch_code', 'supplier:id,name', 'supplierReturn:id,return_number'])
                ->where('store_id', $store->id)->where('source', '!=', 'customer_handover')->whereIn('status', ['held', 'returned'])->latest()->take(100)->get()
                ->map(fn (CylinderIncident $x) => [
                    'id' => $x->id, 'product_id' => $x->product_id, 'product' => $x->product?->name, 'quantity' => $x->quantity, 'reason' => CylinderIncident::REASONS[$x->reason] ?? $x->reason,
                    'status' => $x->status, 'batch' => $x->batch?->batch_code, 'supplier_id' => $x->supplier_id, 'supplier' => $x->supplier?->name,
                    'was_empty' => $x->was_empty, 'note' => $x->note, 'return_number' => $x->supplierReturn?->return_number,
                    'photo_url' => $x->photo_path ? \App\Support\PrivateDocument::url('cylinder-incident', $x->id, 'photo_path') : null,
                    'created_at' => $x->created_at->format('M j, Y'),
                ])->values(),
            'returns'     => SupplierReturn::with(['supplier:id,name', 'incidents'])->where('store_id', $store->id)->latest()->take(30)->get()
                ->map(fn (SupplierReturn $r) => ['id' => $r->id, 'return_number' => $r->return_number, 'status' => $r->status, 'supplier' => $r->supplier?->name,
                    'quantity' => $r->quantity(), 'credited_amount' => $r->credited_amount !== null ? (float) $r->credited_amount : null, 'created_at' => $r->created_at->format('M j, Y'),
                    // K6: how much of the credit went against unpaid purchase orders of this supplier
                    'credit_applied' => $r->credited_amount !== null ? \App\Services\SupplierPaymentService::creditApplied($r) : null])->values(),
            'suppliers'   => Supplier::where('store_id', $store->id)->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'reasons'     => CylinderIncident::REASONS,
            'warn_days'   => config('inventory.warn_days'),
        ]);
    }

    /** One overview row: filled / usable / empty / damaged, expiry badges, batches and the reorder formula (J7). */
    public static function row(Inventory $i): array
    {
        $p = $i->product;
        $warn = (int) collect(config('inventory.warn_days', [90, 30]))->min();
        $batches = $p && $p->isLpg() ? CylinderBatch::with('supplier:id,name')->where('product_id', $p->id)->where('quantity_remaining', '>', 0)
            ->orderByRaw('requalification_due_on IS NULL, requalification_due_on ASC')->get() : collect();
        $expired = $batches->filter(fn ($b) => $b->isExpired());
        $soon = $batches->filter(fn ($b) => ! $b->isExpired() && $b->daysLeft() !== null && $b->daysLeft() <= $warn);

        return [
            'id'               => $i->id,
            'quantity'         => $i->quantity,
            'usable'           => $p ? StockService::usableFilled($p->id, $i) : 0,
            'undated'          => $p && $p->isLpg() ? max(0, (int) $i->quantity - (int) $batches->sum('quantity_remaining')) : 0,   // K6
            'empty_quantity'   => (int) $i->empty_quantity,
            'damaged_quantity' => (int) $i->damaged_quantity,
            'reorder_level'    => $i->reorder_level,
            'expired'          => (int) $expired->sum('quantity_remaining'),
            'expiring'         => $soon->isEmpty() ? null : ['qty' => (int) $soon->sum('quantity_remaining'), 'days' => (int) $soon->min(fn ($b) => $b->daysLeft())],
            'batches'          => $batches->map(fn (CylinderBatch $b) => [
                'id' => $b->id, 'batch_code' => $b->batch_code, 'remaining' => $b->quantity_remaining, 'received' => $b->quantity_received,
                'requalification_due_on' => $b->requalification_due_on?->toDateString(), 'manufactured_on' => $b->manufactured_on?->toDateString(),
                'received_on' => $b->received_on?->toDateString(), 'days_left' => $b->daysLeft(), 'expired' => $b->isExpired(), 'supplier' => $b->supplier?->name, 'source' => $b->source,
            ])->values(),
            'reorder'          => $p ? ReorderService::forProduct($p) : null,
            'product' => $p ? [
                'id'           => $p->id,
                'name'         => $p->name,
                'brand'        => $p->brand ?? '',
                'is_active'    => $p->is_active,
                'product_type' => $p->product_type ?? 'lpg',
            ] : ['id' => 0, 'name' => 'Unknown', 'brand' => '', 'is_active' => false, 'product_type' => 'lpg'],
        ];
    }

    public function stockIn(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        // J7: LPG stock comes in as a batch with its requalification (expiry) date — required for LPG, not for accessories
        $data = $request->validate([
            'quantity'               => 'required|integer|min:1',
            'notes'                  => 'nullable|string|max:500',
            'requalification_due_on' => [$product->isLpg() ? 'required' : 'nullable', 'date', 'after:today'],
            'manufactured_on'        => 'nullable|date|before_or_equal:today',
            'batch_code'             => 'nullable|string|max:40',
        ], StockService::batchDateMessages());
        StockService::checkBatchDates($data);   // K6: manufactured date not in the future + before the requalification date

        $batch = \Illuminate\Support\Facades\DB::transaction(fn () => StockService::receive($product, (int) $data['quantity'], $data, auth()->id(), null, $data['notes'] ?? 'Stock in'));

        return back()->with('success', "Added {$data['quantity']} unit(s) to {$product->name}" . ($batch ? " (batch {$batch->batch_code})" : '') . '.');
    }

    public function stockOut(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'quantity' => 'required|integer|min:1',
            'notes'    => 'nullable|string|max:500',
        ]);

        $inventory = $product->inventory;
        if (! $inventory) return back()->with('error', 'No inventory record found.');
        if ($inventory->quantity < $data['quantity']) {
            return back()->with('error', "Insufficient stock. Current: {$inventory->quantity} unit(s).");
        }

        $inventory->decrement('quantity', $data['quantity']);
        StockService::reconcileBatches($product->id);   // J7: batches never hold more than the filled count
        InventoryTransaction::create([
            'product_id' => $product->id,
            'type'       => 'out',
            'quantity'   => $data['quantity'],
            'notes'      => $data['notes'] ?? null,
            'user_id'    => auth()->id(),
        ]);

        return back()->with('success', "Removed {$data['quantity']} unit(s) from {$product->name}.");
    }

    /** K6: "Add dates to old stock" — part of the unbatched (pre-J7) stock becomes an 'opening' batch. No stock change. */
    public function dateOldStock(Request $request, Product $product): RedirectResponse
    {
        abort_unless($product->store_id === $request->attributes->get('seller_store')->id, 403);
        if (! $product->isLpg()) {
            return back()->with('error', 'Only LPG cylinders have requalification dates.');
        }
        $data = $request->validate([
            'quantity'               => 'required|integer|min:1|max:99999',
            'requalification_due_on' => 'required|date',
            'manufactured_on'        => 'nullable|date|before_or_equal:today',
            'batch_code'             => 'nullable|string|max:40',
        ], StockService::batchDateMessages() + ['quantity.required' => 'Enter how many cylinders to date.', 'quantity.min' => 'Enter at least 1 cylinder.']);
        $batch = StockService::dateOldStock($product, (int) $data['quantity'], $data, $request->user()->id);

        return back()->with('success', "Batch {$batch->batch_code}: {$batch->quantity_remaining} cylinder(s) of {$product->name} dated"
            . ($batch->isExpired() ? ' — already past the requalification date, so they won\'t be sold. Mark them as expired.' : '.'));
    }

    public function updateReorderLevel(Request $request, Product $product): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($product->store_id !== $store->id) abort(403);

        $data = $request->validate(['reorder_level' => 'required|integer|min:0|max:9999']);
        $product->inventory?->update(['reorder_level' => $data['reorder_level']]);

        return back()->with('success', "Reorder level updated for {$product->name}.");
    }

    // ── J7: damaged / expired cylinders, supplier returns ──────────────────

    /** "Record damaged / expired": filled (or empty) → damaged, batch −qty, incident held. */
    public function damaged(Request $request, Product $product): RedirectResponse
    {
        abort_unless($product->store_id === $request->attributes->get('seller_store')->id, 403);
        $data = $request->validate([
            'quantity'          => 'required|integer|min:1|max:9999',
            'reason'            => 'required|in:' . implode(',', array_keys(CylinderIncident::REASONS)),
            'cylinder_batch_id' => 'nullable|integer',
            'note'              => 'nullable|string|max:500',
            'was_empty'         => 'nullable|boolean',
            'photo'             => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);
        $incident = CylinderService::record($product, (int) $data['quantity'], $data['reason'], $data['cylinder_batch_id'] ?? null, $data['note'] ?? null,
            $request->file('photo'), $request->boolean('was_empty'), $request->user()->id);

        return back()->with('success', "{$incident->quantity} {$product->name} cylinder(s) held aside as " . strtolower(CylinderIncident::REASONS[$incident->reason]) . '.');
    }

    /** "Mark as expired" from the batch drawer. */
    public function expireBatch(Request $request, CylinderBatch $batch): RedirectResponse
    {
        abort_unless($batch->store_id === $request->attributes->get('seller_store')->id, 403);
        $incident = CylinderService::markBatchExpired($batch, $request->user()->id);

        return back()->with('success', "Batch {$batch->batch_code}: {$incident->quantity} cylinder(s) marked as expired and held aside.");
    }

    public function dispose(Request $request, CylinderIncident $incident): RedirectResponse
    {
        abort_unless($incident->store_id === $request->attributes->get('seller_store')->id, 403);
        CylinderService::dispose($incident, $request->user()->id);

        return back()->with('success', 'Cylinder(s) disposed of.');
    }

    public function createReturn(Request $request): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        $data = $request->validate([
            'supplier_id'    => 'required|integer',
            'incident_ids'   => 'required|array|min:1',
            'incident_ids.*' => 'integer',
            'notes'          => 'nullable|string|max:1000',
        ]);
        $supplier = Supplier::where('store_id', $store->id)->findOrFail($data['supplier_id']);
        $return = CylinderService::createReturn($store, $supplier, $data['incident_ids'], $data['notes'] ?? null, $request->user()->id);

        return back()->with('success', "Return {$return->return_number} to {$supplier->name} created — print the return slip for the driver.");
    }

    public function returnOutcome(Request $request, SupplierReturn $supplierReturn): RedirectResponse
    {
        abort_unless($supplierReturn->store_id === $request->attributes->get('seller_store')->id, 403);
        $data = $request->validate([
            'outcome'                => 'required|in:replaced,credited,rejected',
            'requalification_due_on' => 'required_if:outcome,replaced|nullable|date|after:today',
            'manufactured_on'        => 'nullable|date|before_or_equal:today',
            'batch_code'             => 'nullable|string|max:40',
            'credited_amount'        => 'required_if:outcome,credited|nullable|numeric|min:0|max:9999999',
        ], StockService::batchDateMessages() + ['credited_amount.required_if' => 'Enter the amount the supplier credited.']);
        if ($data['outcome'] === 'replaced') {
            StockService::checkBatchDates($data);
        }
        CylinderService::outcome($supplierReturn, $data['outcome'], $data, $request->user()->id);

        return back()->with('success', "Return {$supplierReturn->return_number}: " . ['replaced' => 'replacement received — stock updated.',
            'credited' => 'credit recorded.', 'rejected' => 'rejected — the cylinders are still held; dispose of them when ready.'][$data['outcome']]);
    }

    public function returnSlip(Request $request, SupplierReturn $supplierReturn)
    {
        abort_unless($supplierReturn->store_id === $request->attributes->get('seller_store')->id, 403);

        return response(CylinderService::returnSlipPdf($supplierReturn), 200, [
            'Content-Type' => 'application/pdf', 'Content-Disposition' => "inline; filename=\"{$supplierReturn->return_number}.pdf\"",
        ]);
    }
}