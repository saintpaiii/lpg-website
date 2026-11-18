<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseOrderPayment;
use App\Services\SupplierPaymentService;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Services\PurchaseOrderService;
use App\Services\ReorderService;
use App\Services\StaffAccess;
use App\Services\StockService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** J7: purchase orders — Draft | Sent | Receiving | Done | Cancelled. */
class PurchaseOrderController extends Controller
{
    private const TABS = [
        'draft'     => ['draft'],
        'sent'      => ['sent'],
        'receiving' => ['partially_received'],
        'done'      => ['received'],
        'cancelled' => ['cancelled'],
    ];

    private function storeOf(Request $request)
    {
        return $request->attributes->get('seller_store');
    }

    private function own(Request $request, PurchaseOrder $po): void
    {
        abort_unless($po->store_id === $this->storeOf($request)->id, 403);
    }

    /** What this person may do (the owner can do everything). */
    public static function abilities($user): array
    {
        $owner = $user->role === 'seller';
        $can = fn (string $p) => $owner || StaffAccess::can($user, $p);

        return ['create' => $can('inventory.po_create'), 'send' => $can('inventory.po_send'), 'receive' => $can('inventory.po_receive'), 'suppliers' => $can('inventory.suppliers'),
            // K6: recording supplier payments = inventory.po_send; deleting one (a typo) = the owner only
            'pay' => $can('inventory.po_send'), 'owner' => $owner];
    }

    public function index(Request $request): Response
    {
        $store = $this->storeOf($request);
        $tab = array_key_exists($request->input('tab'), self::TABS) || $request->input('tab') === 'unpaid' ? $request->input('tab') : 'draft';
        $base = PurchaseOrder::where('store_id', $store->id);
        // K6: "Unpaid to suppliers" — received (partly or fully) and not paid yet, oldest due first
        $unpaid = fn ($q) => $q->whereIn('status', ['partially_received', 'received'])->where('payment_status', '!=', 'paid');

        $query = $tab === 'unpaid'
            ? $unpaid(clone $base)->orderByRaw('payment_due_on IS NULL, payment_due_on ASC')->orderBy('id')
            : (clone $base)->whereIn('status', self::TABS[$tab])->latest();
        $orders = $query->with(['supplier:id,name', 'items'])->paginate(20)->withQueryString()
            ->through(fn (PurchaseOrder $po) => [
                'id' => $po->id, 'po_number' => $po->po_number, 'status' => $po->status, 'status_label' => PurchaseOrder::STATUS_LABELS[$po->status],
                'source' => $po->source, 'supplier' => $po->supplier?->name, 'items' => $po->items->count(),
                'quantity' => (int) $po->items->sum('quantity_ordered'), 'received' => (int) $po->items->sum('quantity_received'),
                'subtotal' => (float) $po->subtotal, 'expected_on' => $po->expected_on?->format('M j, Y'), 'created_at' => $po->created_at->format('M j, Y'),
            ] + static::paymentRow($po));

        return Inertia::render('seller/purchase-orders', [
            'orders' => $orders,
            'tab'    => $tab,
            'counts' => collect(self::TABS)->map(fn ($st) => (clone $base)->whereIn('status', $st)->count())->put('unpaid', $unpaid(clone $base)->count()),
            'payables' => SupplierPaymentService::summary($store->id),
            'suppliers' => static::supplierCatalog($store->id),
            'can'    => static::abilities($request->user()),
        ]);
    }

    /** K6: the payment columns of a PO (list + page). */
    public static function paymentRow(PurchaseOrder $po): array
    {
        $received = $po->receivedValue();

        return [
            'payment_status' => $po->payment_status, 'payment_label' => PurchaseOrder::PAYMENT_LABELS[$po->payment_status] ?? 'Unpaid',
            'received_value' => $received, 'amount_paid' => (float) $po->amount_paid, 'balance' => $po->balance(),
            'payment_due_on' => $po->payment_due_on?->toDateString(), 'payment_due_label' => $po->payment_due_on?->format('M j, Y'),
            'overdue' => $po->isOverdue(), 'payable' => $received > 0,
        ];
    }

    /** Suppliers with their products prefilled (unit cost, min qty) for "New purchase order". */
    public static function supplierCatalog(int $storeId): array
    {
        return Supplier::where('store_id', $storeId)->where('is_active', true)->with('products.product:id,name,product_type')->orderBy('name')->get()
            ->map(fn (Supplier $s) => ['id' => $s->id, 'name' => $s->name, 'email' => $s->email, 'lead_time_days' => $s->lead_time_days,
                'products' => $s->products->filter(fn ($l) => $l->product)->map(fn (SupplierProduct $l) => [
                    'product_id' => $l->product_id, 'name' => $l->product->name, 'unit_cost' => (float) $l->unit_cost, 'min_order_qty' => $l->min_order_qty,
                    'suggested' => ReorderService::forProduct($l->product)['due'] ? ReorderService::forProduct($l->product)['suggested_qty'] : 0,
                ])->values()])->all();
    }

    private function lineRules(): array
    {
        return [
            'lines'              => 'required|array|min:1|max:100',
            'lines.*.product_id' => 'required|integer',
            'lines.*.quantity'   => 'required|integer|min:0|max:99999',
            'lines.*.unit_cost'  => 'required|numeric|min:0|max:999999',
            'notes'              => 'nullable|string|max:1000',
            'expected_on'        => 'nullable|date',
        ];
    }

    public function store(Request $request): RedirectResponse
    {
        $store = $this->storeOf($request);
        $data = $request->validate(['supplier_id' => 'required|integer'] + $this->lineRules());
        $supplier = Supplier::where('store_id', $store->id)->findOrFail($data['supplier_id']);
        $po = PurchaseOrderService::createDraft($store, $supplier, $data['lines'], $request->user()->id, 'manual', $data['notes'] ?? null, $data['expected_on'] ?? null);

        return redirect("/seller/purchase-orders/{$po->id}")->with('success', "Draft {$po->po_number} created.");
    }

    public function show(Request $request, PurchaseOrder $purchaseOrder): Response
    {
        $this->own($request, $purchaseOrder);
        $po = $purchaseOrder->load(['supplier', 'items.product.inventory', 'creator:id,name', 'sender:id,name', 'payments.recorder:id,name']);
        $mins = SupplierProduct::where('supplier_id', $po->supplier_id)->pluck('min_order_qty', 'product_id');
        $below = PurchaseOrderService::belowMinimum($po);

        return Inertia::render('seller/purchase-order-show', [
            'po' => static::paymentRow($po) + [
                'payment_terms' => $po->supplier?->payment_terms,
                'payments' => $po->payments->map(fn ($p) => [
                    'id' => $p->id, 'amount' => (float) $p->amount, 'paid_on' => $p->paid_on->format('M j, Y'), 'method' => $p->method,
                    'method_label' => PurchaseOrderPayment::METHODS[$p->method] ?? $p->method, 'reference' => $p->reference, 'note' => $p->note,
                    'is_credit' => $p->supplier_return_id !== null, 'recorded_by' => $p->recorder?->name,
                ])->values(),
                // K6: lines below the supplier's minimum order (a draft may be; sending is refused)
                'below_minimum' => collect($below)->map(fn ($b) => "{$b['name']}: minimum order from this supplier is {$b['min']}.")->values(),
            ] + [
                'id' => $po->id, 'po_number' => $po->po_number, 'status' => $po->status, 'status_label' => PurchaseOrder::STATUS_LABELS[$po->status],
                'source' => $po->source, 'notes' => $po->notes, 'subtotal' => (float) $po->subtotal,
                'expected_on' => $po->expected_on?->toDateString(), 'created_at' => $po->created_at->format('M j, Y g:i A'),
                'sent_at' => $po->sent_at?->format('M j, Y g:i A'), 'received_at' => $po->received_at?->format('M j, Y g:i A'),
                'created_by' => $po->creator?->name, 'sent_by' => $po->sender?->name, 'any_received' => $po->anyReceived(),
                'supplier' => ['id' => $po->supplier?->id, 'name' => $po->supplier?->name, 'email' => $po->supplier?->email, 'phone' => $po->supplier?->phone,
                    'lead_time_days' => $po->supplier?->lead_time_days],
                'items' => $po->items->map(fn (PurchaseOrderItem $i) => [
                    'id' => $i->id, 'product_id' => $i->product_id, 'name' => $i->product?->name, 'is_lpg' => (bool) $i->product?->isLpg(),
                    'quantity_ordered' => $i->quantity_ordered, 'quantity_received' => $i->quantity_received, 'remaining' => $i->remaining(),
                    'min_order_qty' => (int) ($mins[$i->product_id] ?? 1),
                    'unit_cost' => (float) $i->unit_cost, 'line_total' => (float) $i->line_total, 'empties_sent' => $i->empties_sent,
                    'empties_in_stock' => (int) ($i->product?->inventory?->empty_quantity ?? 0),
                    'reorder' => $i->product ? ReorderService::forProduct($i->product)['text'] : null,
                ])->values(),
            ],
            'catalog' => $po->status === 'draft' ? collect(static::supplierCatalog($po->store_id))->firstWhere('id', $po->supplier_id)['products'] ?? [] : [],
            'can' => static::abilities($request->user()),
            'methods' => PurchaseOrderPayment::METHODS,
        ]);
    }

    // ── K6: supplier payments ────────────────────────────────────────────────

    public function recordPayment(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        $data = $request->validate([
            'amount'    => 'required|numeric|min:0.01|max:99999999',
            'paid_on'   => 'required|date|before_or_equal:today',
            'method'    => 'required|in:' . implode(',', array_keys(PurchaseOrderPayment::METHODS)),
            'reference' => 'nullable|string|max:100',
            'note'      => 'nullable|string|max:500',
        ], [
            'amount.required' => 'Enter the amount paid.', 'amount.min' => 'Enter an amount above ₱0.', 'amount.numeric' => 'Enter the amount paid.',
            'paid_on.required' => 'Enter the payment date.', 'paid_on.before_or_equal' => "The payment date can't be in the future.",
            'method.required' => 'Choose how you paid.', 'method.in' => 'Choose how you paid.',
        ]);
        $payment = SupplierPaymentService::record($purchaseOrder, $data, $request->user()->id);
        $po = $purchaseOrder->fresh('items');

        return back()->with('success', '₱' . number_format((float) $payment->amount, 2) . " recorded for {$po->po_number}"
            . ($po->payment_status === 'paid' ? ' — fully paid.' : ' — balance ₱' . number_format($po->balance(), 2) . '.'));
    }

    /** Owner only (a typo): the status is recomputed. */
    public function deletePayment(Request $request, PurchaseOrder $purchaseOrder, PurchaseOrderPayment $payment): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        abort_unless($payment->purchase_order_id === $purchaseOrder->id, 404);
        if ($request->user()->role !== 'seller') {
            return back()->with('error', 'Only the store owner can delete a supplier payment.');
        }
        SupplierPaymentService::delete($payment);

        return back()->with('success', 'Payment deleted — the balance was updated.');
    }

    public function setDueDate(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        $data = $request->validate(['payment_due_on' => 'nullable|date'], ['payment_due_on.date' => 'Enter a valid due date.']);
        $purchaseOrder->update(['payment_due_on' => $data['payment_due_on'] ?? null, 'payment_reminders' => null]);

        return back()->with('success', $data['payment_due_on'] ?? null ? 'Payment due date saved.' : 'Payment due date cleared.');
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        $data = $request->validate($this->lineRules());
        PurchaseOrderService::updateDraft($purchaseOrder, $data['lines'], $data['notes'] ?? null, $data['expected_on'] ?? null);

        return back()->with('success', 'Draft saved.');
    }

    public function send(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        $result = PurchaseOrderService::send($purchaseOrder, $request->user());

        return back()->with($result === 'email_failed' ? 'warning' : 'success', match ($result) {
            'emailed'      => "{$purchaseOrder->po_number} sent — the PDF was emailed to {$purchaseOrder->supplier?->email}.",
            'email_failed' => "{$purchaseOrder->po_number} marked as sent, but the email could not be delivered — download the PDF and send it yourself.",
            default        => "{$purchaseOrder->po_number} marked as sent (the supplier has no email — download the PDF to send it).",
        });
    }

    public function cancel(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        PurchaseOrderService::cancel($purchaseOrder);

        return back()->with('success', "{$purchaseOrder->po_number} cancelled.");
    }

    public function receive(Request $request, PurchaseOrder $purchaseOrder): RedirectResponse
    {
        $this->own($request, $purchaseOrder);
        $data = $request->validate([
            'rows'                          => 'required|array',
            'rows.*.quantity'               => 'nullable|integer|min:0|max:99999',
            'rows.*.requalification_due_on' => 'nullable|date|after:today',
            'rows.*.manufactured_on'        => 'nullable|date|before_or_equal:today',
            'rows.*.batch_code'             => 'nullable|string|max:40',
            'rows.*.empties_sent'           => 'nullable|integer|min:0|max:99999',
        ], ['rows.*.requalification_due_on.after' => 'The requalification date must be in the future (expired cylinders can\'t be received as stock).',
            'rows.*.quantity.integer' => 'Enter a whole number.', 'rows.*.quantity.min' => 'The quantity can\'t be negative.',
            'rows.*.empties_sent.integer' => 'Enter a whole number of empties.', 'rows.*.empties_sent.min' => 'Empties can\'t be negative.',
        ] + StockService::batchDateMessages('rows.*.'));
        $po = PurchaseOrderService::receive($purchaseOrder, $data['rows'], $request->user());

        return back()->with('success', $po->status === 'received' ? "{$po->po_number} fully received — stock updated." : "Received part of {$po->po_number} — stock updated.");
    }

    public function pdf(Request $request, PurchaseOrder $purchaseOrder)
    {
        $this->own($request, $purchaseOrder);

        return response(PurchaseOrderService::pdf($purchaseOrder), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => ($request->boolean('download') ? 'attachment' : 'inline') . "; filename=\"{$purchaseOrder->po_number}.pdf\"",
        ]);
    }

    /** DSS reorder alert → "Open draft PO-000012" when one has this product's supplier, else "Create PO" with the suggestion. */
    public function fromAlert(Request $request, Product $product): RedirectResponse
    {
        $store = $this->storeOf($request);
        abort_unless($product->store_id === $store->id, 403);
        $pref = PurchaseOrderService::preferredFor($product->id);
        if (! $pref) {
            return redirect('/seller/suppliers')->with('warning', "No supplier set for {$product->name} — add one to create a purchase order.");
        }
        $calc = ReorderService::forProduct($product);
        $draft = PurchaseOrder::where('store_id', $store->id)->where('supplier_id', $pref->supplier_id)->where('status', 'draft')->latest()->first();
        if ($draft) {
            if (! $draft->items()->where('product_id', $product->id)->exists()) {
                PurchaseOrderItem::create(['purchase_order_id' => $draft->id, 'product_id' => $product->id, 'quantity_ordered' => $calc['suggested_qty'],
                    'unit_cost' => $pref->unit_cost, 'line_total' => round($calc['suggested_qty'] * (float) $pref->unit_cost, 2)]);
                $draft->recalcSubtotal();
            }

            return redirect("/seller/purchase-orders/{$draft->id}");
        }
        $po = PurchaseOrderService::createDraft($store, $pref->supplier, [['product_id' => $product->id, 'quantity' => $calc['suggested_qty'], 'unit_cost' => (float) $pref->unit_cost]],
            $request->user()->id, 'manual', $calc['text']);

        return redirect("/seller/purchase-orders/{$po->id}")->with('success', "Draft {$po->po_number} created from the DSS suggestion.");
    }
}
