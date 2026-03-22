<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Product;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private function generateOrderNumber(): string
    {
        $year   = date('Y');
        $prefix = "ORD-{$year}-";
        $count  = Order::withTrashed()
            ->whereYear('created_at', $year)
            ->count();
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    private function generateInvoiceNumber(): string
    {
        $year   = date('Y');
        $prefix = "INV-{$year}-";
        $count  = Invoice::withTrashed()
            ->whereYear('created_at', $year)
            ->count();
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    private function formatOrder(Order $o): array
    {
        return [
            'id'               => $o->id,
            'order_number'     => $o->order_number,
            'status'           => $o->status,
            'transaction_type' => $o->transaction_type,
            'total_amount'     => (float) $o->total_amount,
            'payment_method'   => $o->payment_method,
            'payment_status'   => $o->payment_status,
            'notes'            => $o->notes,
            'ordered_at'       => $o->ordered_at?->format('M d, Y g:i A'),
            'delivered_at'     => $o->delivered_at?->format('M d, Y g:i A'),
            'created_at'       => $o->created_at->format('M d, Y g:i A'),
            'deleted_at'       => $o->deleted_at?->format('M d, Y g:i A'),
            'customer' => $o->customer ? [
                'id'      => $o->customer->id,
                'name'    => $o->customer->name,
                'phone'   => $o->customer->phone,
                'address' => $o->customer->address,
                'barangay'=> $o->customer->barangay,
                'city'    => $o->customer->city,
            ] : null,
            'items' => $o->items->map(fn ($item) => [
                'id'         => $item->id,
                'quantity'   => $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal'   => (float) $item->subtotal,
                'product'    => $item->product ? [
                    'id'    => $item->product->id,
                    'name'  => $item->product->name,
                    'brand' => $item->product->brand,
                ] : null,
            ])->values()->all(),
            'created_by'    => $o->createdBy ? ['name' => $o->createdBy->name] : null,
            'order_source'  => ($o->createdBy && $o->createdBy->role === 'customer') ? 'online' : 'admin',
            'has_invoice'   => $o->invoice()->exists(),
            'invoice_number'=> $o->invoice?->invoice_number,
            'invoice_id'    => $o->invoice?->id,
            'store_name'       => $o->store?->store_name,
            'store_id'         => $o->store_id,
            'commission_amount'=> $o->invoice ? (float) $o->invoice->platform_commission : null,
        ];
    }

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'active');

        $query = Order::with(['customer', 'items.product', 'createdBy', 'invoice', 'store']);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($payStatus = $request->input('payment_status')) {
            $query->where('payment_status', $payStatus);
        }

        if ($txType = $request->input('transaction_type')) {
            $query->where('transaction_type', $txType);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        if ($dateFrom = $request->input('date_from')) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->input('date_to')) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $orders = $query
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($o) => $this->formatOrder($o));

        $archivedCount = Order::onlyTrashed()->count();

        return Inertia::render('admin/orders', [
            'orders'        => $orders,
            'tab'           => $tab,
            'archivedCount' => $archivedCount,
            'filters'       => $request->only('status', 'payment_status', 'transaction_type', 'search', 'date_from', 'date_to', 'tab'),
            'userRole'      => 'admin',
        ]);
    }

    // ── Create ────────────────────────────────────────────────────────────────

    public function create(): Response
    {
        $customers = Customer::orderBy('name')
            ->get(['id', 'name', 'phone', 'address', 'city', 'barangay']);

        $products = Product::where('is_active', true)
            ->with('inventory')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id'            => $p->id,
                'name'          => $p->name,
                'brand'         => $p->brand,
                'weight_kg'     => $p->weight_kg,
                'selling_price' => (float) $p->selling_price,
                'stock'         => $p->inventory?->quantity ?? 0,
            ]);

        return Inertia::render('admin/order-create', [
            'customers' => $customers,
            'products'  => $products,
        ]);
    }

    // ── Store ─────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'customer_id'        => 'required|exists:customers,id',
            'transaction_type'   => 'required|in:refill,new_purchase',
            'payment_method'     => 'required|in:cash,gcash,bank_transfer,maya',
            'payment_status'     => 'required|in:unpaid,paid,partial',
            'notes'              => 'nullable|string|max:1000',
            'items'              => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity'   => 'required|integer|min:1',
        ]);

        $order = DB::transaction(function () use ($data, $request) {
            $totalAmount = 0;
            $lineItems   = [];

            foreach ($data['items'] as $item) {
                $product     = Product::findOrFail($item['product_id']);
                $unitPrice   = (float) $product->selling_price;
                $subtotal    = $unitPrice * $item['quantity'];
                $totalAmount += $subtotal;

                $lineItems[] = [
                    'product'    => $product,
                    'quantity'   => $item['quantity'],
                    'unit_price' => $unitPrice,
                    'subtotal'   => $subtotal,
                ];
            }

            $order = Order::create([
                'order_number'     => $this->generateOrderNumber(),
                'customer_id'      => $data['customer_id'],
                'transaction_type' => $data['transaction_type'],
                'status'           => 'pending',
                'total_amount'     => $totalAmount,
                'payment_method'   => $data['payment_method'],
                'payment_status'   => $data['payment_status'],
                'notes'            => $data['notes'] ?? null,
                'ordered_at'       => now(),
                'created_by'       => auth()->id(),
            ]);

            foreach ($lineItems as $line) {
                $order->items()->create([
                    'product_id' => $line['product']->id,
                    'quantity'   => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'subtotal'   => $line['subtotal'],
                ]);
            }

            return $order;
        });

        return redirect("/admin/orders/{$order->id}")
            ->with('success', "Order {$order->order_number} created.");
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(Order $order): Response
    {
        $order->load(['customer', 'items.product', 'createdBy', 'invoice', 'delivery.rider', 'store']);

        $riders = User::where('role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'phone'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'phone' => $r->phone])
            ->values()
            ->all();

        return Inertia::render('admin/order-show', [
            'order'    => $this->formatOrder($order) + [
                'delivery' => $order->delivery ? [
                    'id'     => $order->delivery->id,
                    'status' => $order->delivery->status,
                    'rider'  => $order->delivery->rider
                        ? ['name' => $order->delivery->rider->name, 'phone' => $order->delivery->rider->phone]
                        : null,
                    'assigned_at'  => $order->delivery->assigned_at?->format('M d, Y g:i A'),
                    'delivered_at' => $order->delivery->delivered_at?->format('M d, Y g:i A'),
                ] : null,
            ],
            'riders'   => $riders,
            'userRole' => 'admin',
        ]);
    }

    // ── Update Status ─────────────────────────────────────────────────────────

    public function updateStatus(Request $request, Order $order): RedirectResponse
    {
        $data = $request->validate([
            'status' => 'required|in:pending,confirmed,preparing,out_for_delivery,delivered,cancelled',
        ]);

        $newStatus = $data['status'];
        $oldStatus = $order->status;

        // Cannot change status of already-cancelled or delivered orders
        if (in_array($oldStatus, ['cancelled', 'delivered']) && $newStatus !== $oldStatus) {
            return back()->with('error', "Cannot change status of a {$oldStatus} order.");
        }

        DB::transaction(function () use ($order, $newStatus, $oldStatus) {

            // ── Confirm: check stock, decrement, create invoice ──────────────
            if ($newStatus === 'confirmed' && $oldStatus === 'pending') {
                // Reload items with product inventory for stock check
                $order->load('items.product.inventory');

                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    if (! $inventory) {
                        abort(422, "No inventory record for {$item->product?->name}.");
                    }
                    if ($inventory->quantity < $item->quantity) {
                        abort(422, "Insufficient stock for {$item->product?->name}. Available: {$inventory->quantity}, required: {$item->quantity}.");
                    }
                }

                // Decrement stock
                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    $inventory->decrement('quantity', $item->quantity);

                    InventoryTransaction::create([
                        'product_id' => $item->product_id,
                        'type'       => 'order',
                        'quantity'   => $item->quantity,
                        'reference'  => $order->order_number,
                        'notes'      => 'Order confirmed',
                        'user_id'    => auth()->id(),
                    ]);
                }

                // Create invoice if one doesn't exist
                if (! $order->invoice()->exists()) {
                    $paid = $order->payment_status === 'paid' ? $order->total_amount : 0;
                    Invoice::create([
                        'invoice_number' => $this->generateInvoiceNumber(),
                        'order_id'       => $order->id,
                        'customer_id'    => $order->customer_id,
                        'total_amount'   => $order->total_amount,
                        'payment_status' => $order->payment_status,
                        'paid_amount'    => $paid,
                        'payment_method' => $order->payment_method,
                        'paid_at'        => $order->payment_status === 'paid' ? now() : null,
                        'due_date'       => now()->addDays(7),
                    ]);
                }
            }

            // ── Cancel: restore stock if it was previously decremented ───────
            if ($newStatus === 'cancelled' && ! in_array($oldStatus, ['cancelled', 'pending'])) {
                $order->load('items');
                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    if ($inventory) {
                        $inventory->increment('quantity', $item->quantity);
                        InventoryTransaction::create([
                            'product_id' => $item->product_id,
                            'type'       => 'cancelled',
                            'quantity'   => $item->quantity,
                            'reference'  => $order->order_number,
                            'notes'      => 'Order cancelled — stock restored',
                            'user_id'    => auth()->id(),
                        ]);
                    }
                }
            }

            $updates = ['status' => $newStatus];

            if ($newStatus === 'delivered' && ! $order->delivered_at) {
                $updates['delivered_at'] = now();

                // Calculate and save platform commission to invoice
                $order->loadMissing(['store', 'invoice']);
                if ($order->invoice) {
                    $rate       = $order->store
                        ? (float) $order->store->commission_rate
                        : (float) Setting::get('default_commission_rate', 5);
                    $commission = round((float) $order->total_amount * $rate / 100, 2);
                    $order->invoice->update(['platform_commission' => $commission]);
                }
            }

            $order->update($updates);
        });

        $label = str_replace('_', ' ', $newStatus);
        return back()->with('success', "Order {$order->order_number} marked as " . ucfirst($label) . '.');
    }

    // ── Update Payment ────────────────────────────────────────────────────────

    public function updatePayment(Request $request, Order $order): RedirectResponse
    {
        $data = $request->validate([
            'payment_status' => 'required|in:unpaid,paid,partial',
            'payment_method' => 'required|in:cash,gcash,bank_transfer,maya',
        ]);

        $order->update($data);

        // Sync invoice payment if exists
        if ($invoice = $order->invoice) {
            $paid = $data['payment_status'] === 'paid' ? $order->total_amount : $invoice->paid_amount;
            $invoice->update([
                'payment_status' => $data['payment_status'],
                'payment_method' => $data['payment_method'],
                'paid_amount'    => $paid,
                'paid_at'        => $data['payment_status'] === 'paid' ? ($invoice->paid_at ?? now()) : $invoice->paid_at,
            ]);
        }

        return back()->with('success', "Payment updated for {$order->order_number}.");
    }

    // ── Destroy (soft delete / archive) ───────────────────────────────────────

    public function destroy(Order $order): RedirectResponse
    {
        if (! in_array($order->status, ['cancelled', 'delivered'])) {
            return back()->with('error', 'Only cancelled or delivered orders can be archived.');
        }

        $order->delete();

        return back()->with('success', "Order {$order->order_number} archived.");
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    public function restore(Order $order): RedirectResponse
    {
        $order->restore();

        return back()->with('success', "Order {$order->order_number} restored.");
    }

    // ── Force Delete ──────────────────────────────────────────────────────────

    public function forceDestroy(Order $order): RedirectResponse
    {
        $num = $order->order_number;
        $order->forceDelete();

        return back()->with('success', "Order {$num} permanently deleted.");
    }
}
