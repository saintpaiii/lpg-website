<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\GeneratesExport;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    use GeneratesExport;
    private function generateOrderNumber(): string
    {
        $year   = date('Y');
        $prefix = "ORD-{$year}-";
        $count  = Order::withTrashed()->whereYear('created_at', $year)->count();
        return $prefix . str_pad($count + 1, 5, '0', STR_PAD_LEFT);
    }

    private function generateInvoiceNumber(): string
    {
        $year   = date('Y');
        $prefix = "INV-{$year}-";
        $count  = Invoice::withTrashed()->whereYear('created_at', $year)->count();
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
            'payment_method'      => $o->payment_method,
            'payment_status'      => $o->payment_status,
            'payment_mode'        => $o->payment_mode ?? 'full',
            'down_payment_amount' => $o->down_payment_amount ? (float) $o->down_payment_amount : null,
            'remaining_balance'   => $o->remaining_balance ? (float) $o->remaining_balance : null,
            'notes'               => $o->notes,
            'ordered_at'       => $o->ordered_at?->format('M d, Y g:i A'),
            'delivered_at'     => $o->delivered_at?->format('M d, Y g:i A'),
            'created_at'       => $o->created_at->format('M d, Y g:i A'),
            'deleted_at'       => $o->deleted_at?->format('M d, Y g:i A'),
            'customer' => $o->customer ? [
                'id'      => $o->customer->id,
                'name'    => $o->customer->name,
                'phone'   => $o->customer->phone,
                'address' => $o->customer->address,
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
            'has_invoice'         => $o->invoice()->exists(),
            'invoice_number'      => $o->invoice?->invoice_number,
            'invoice_id'          => $o->invoice?->id,
            'cancellation_reason' => $o->cancellation_reason,
            'cancellation_notes'  => $o->cancellation_notes,
            'cancelled_by'        => $o->cancelled_by,
            'cancelled_at'        => $o->cancelled_at?->format('M d, Y g:i A'),
        ];
    }

    public function index(Request $request): Response
    {
        $store = request()->attributes->get('seller_store');
        $tab   = $request->input('tab', 'active');

        $query = Order::with(['customer', 'items.product', 'invoice'])
            ->where('store_id', $store->id);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        $dateFrom = $request->get('date_from');
        $dateTo   = $request->get('date_to');
        if ($dateFrom) $query->whereDate('created_at', '>=', $dateFrom);
        if ($dateTo)   $query->whereDate('created_at', '<=', $dateTo);

        $orders = $query->latest()->paginate(20)->withQueryString()
            ->through(fn ($o) => $this->formatOrder($o));

        $counts = [
            'pending'          => Order::where('store_id', $store->id)->where('status', 'pending')->count(),
            'confirmed'        => Order::where('store_id', $store->id)->where('status', 'confirmed')->count(),
            'preparing'        => Order::where('store_id', $store->id)->where('status', 'preparing')->count(),
            'out_for_delivery' => Order::where('store_id', $store->id)->where('status', 'out_for_delivery')->count(),
        ];

        $riders = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name])
            ->values()
            ->all();

        return Inertia::render('seller/orders', [
            'orders'  => $orders,
            'tab'     => $tab,
            'counts'  => $counts,
            'filters' => $request->only('status', 'search', 'tab', 'date_from', 'date_to'),
            'riders'  => $riders,
        ]);
    }

    public function export(Request $request)
    {
        $store  = request()->attributes->get('seller_store');
        $tab    = $request->input('tab', 'active');
        $format = $request->get('format', 'csv');

        $query = Order::with(['customer'])
            ->where('store_id', $store->id);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }
        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }
        if ($df = $request->get('date_from')) $query->whereDate('created_at', '>=', $df);
        if ($dt = $request->get('date_to'))   $query->whereDate('created_at', '<=', $dt);

        $orders = $query->latest()->get();

        $from = $request->get('date_from') ?: now()->startOfMonth()->toDateString();
        $to   = $request->get('date_to')   ?: now()->toDateString();
        $filename = $this->exportFilename('orders', $store->store_name, $from, $to, $format);

        $columns = [
            ['key' => 'order_number',     'label' => 'Order #',        'class' => 'mono'],
            ['key' => 'customer_name',    'label' => 'Customer'],
            ['key' => 'created_at',       'label' => 'Date'],
            ['key' => 'status',           'label' => 'Status'],
            ['key' => 'transaction_type', 'label' => 'Type'],
            ['key' => 'payment_method',   'label' => 'Payment'],
            ['key' => 'payment_status',   'label' => 'Pay Status'],
            ['key' => 'total_amount',     'label' => 'Total', 'align' => 'right'],
        ];

        $rows = $orders->map(fn ($o) => [
            'order_number'     => $o->order_number,
            'customer_name'    => $o->customer?->name ?? '—',
            'created_at'       => $o->created_at->setTimezone('Asia/Manila')->format('M d, Y'),
            'status'           => str_replace('_', ' ', $o->status),
            'transaction_type' => $o->transaction_type ?? '—',
            'payment_method'   => $o->payment_method ?? '—',
            'payment_status'   => $o->payment_status,
            'total_amount'     => $this->peso((float) $o->total_amount),
        ])->values()->all();

        $grandTotal = $orders->sum(fn ($o) => (float) $o->total_amount);

        if ($format === 'pdf') {
            return $this->pdfResponse($filename, [
                'title'        => 'Orders Export',
                'orgName'      => $store->store_name,
                'orgSub'       => $store->city ?? 'Cavite, Philippines',
                'dateRange'    => \Carbon\Carbon::parse($from)->format('M d, Y') . ' – ' . \Carbon\Carbon::parse($to)->format('M d, Y'),
                'summaryItems' => [
                    ['label' => 'Total Orders', 'value' => count($rows)],
                    ['label' => 'Grand Total',  'value' => $this->peso($grandTotal)],
                ],
                'columns'   => $columns,
                'rows'      => $rows,
                'totalsRow' => ['order_number' => 'TOTAL', 'customer_name' => '', 'created_at' => '', 'status' => '', 'transaction_type' => '', 'payment_method' => '', 'payment_status' => '', 'total_amount' => $this->peso($grandTotal)],
            ]);
        }

        $headings = ['Order #', 'Customer', 'Date', 'Status', 'Type', 'Payment', 'Pay Status', 'Total'];
        $csvRows  = array_map(fn ($r) => [$r['order_number'], $r['customer_name'], $r['created_at'], $r['status'], $r['transaction_type'], $r['payment_method'], $r['payment_status'], $r['total_amount']], $rows);
        $csvRows[] = ['TOTAL', '', '', '', '', '', '', $this->peso($grandTotal)];
        return $this->csvResponse($filename, $headings, $csvRows);
    }

    public function create(): Response
    {
        $store = request()->attributes->get('seller_store');

        $customers = Customer::orderBy('name')->get(['id', 'name', 'phone', 'address', 'city', 'barangay']);

        $products = Product::where('store_id', $store->id)
            ->where('is_active', true)
            ->with('inventory')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id'             => $p->id,
                'name'           => $p->name,
                'brand'          => $p->brand,
                'weight'         => $p->weight,
                'refill_price'   => (float) ($p->refill_price ?? 0),
                'purchase_price' => (float) ($p->purchase_price ?? 0),
                'stock'          => $p->inventory?->quantity ?? 0,
            ]);

        return Inertia::render('seller/order-create', [
            'customers' => $customers,
            'products'  => $products,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');

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

        // Ensure products belong to this store
        $productIds = collect($data['items'])->pluck('product_id');
        $storeProductIds = Product::where('store_id', $store->id)->whereIn('id', $productIds)->pluck('id');
        if ($storeProductIds->count() !== $productIds->count()) {
            return back()->with('error', 'One or more products do not belong to your store.');
        }

        $order = DB::transaction(function () use ($data, $store) {
            $totalAmount = 0;
            $lineItems   = [];

            foreach ($data['items'] as $item) {
                $product   = Product::findOrFail($item['product_id']);
                $unitPrice = $data['transaction_type'] === 'refill'
                    ? (float) ($product->refill_price ?? $product->selling_price)
                    : (float) ($product->purchase_price ?? $product->selling_price);
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
                'store_id'         => $store->id,
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

        return redirect("/seller/orders/{$order->id}")->with('success', "Order {$order->order_number} created.");
    }

    public function show(Order $order): Response
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        $order->load(['customer', 'items.product', 'invoice', 'delivery.rider', 'payments']);

        // Riders for this store (seller_staff with sub_role=rider)
        $riders = User::where('store_id', $store->id)
            ->where('role', 'seller_staff')
            ->where('sub_role', 'rider')
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'phone'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'phone' => $r->phone])
            ->values()
            ->all();

        $latestPayment = $order->payments->sortByDesc('created_at')->first();

        return Inertia::render('seller/order-show', [
            'order' => $this->formatOrder($order) + [
                'delivery' => $order->delivery ? [
                    'id'           => $order->delivery->id,
                    'status'       => $order->delivery->status,
                    'rider'        => $order->delivery->rider
                        ? ['name' => $order->delivery->rider->name, 'phone' => $order->delivery->rider->phone]
                        : null,
                    'assigned_at'  => $order->delivery->assigned_at?->format('M d, Y g:i A'),
                    'delivered_at' => $order->delivery->delivered_at?->format('M d, Y g:i A'),
                ] : null,
                'payment_record' => $latestPayment ? [
                    'status'    => $latestPayment->status,
                    'pay_ref'   => $latestPayment->paymongo_checkout_id,
                    'paid_at'   => $latestPayment->paid_at?->format('M d, Y'),
                    'method'    => $latestPayment->payment_method,
                ] : null,
            ],
            'riders' => $riders,
        ]);
    }

    public function updateStatus(Request $request, Order $order): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'status'              => 'required|in:pending,confirmed,preparing,out_for_delivery,delivered,cancelled',
            'cancellation_reason' => 'required_if:status,cancelled|nullable|string|max:255',
            'cancellation_notes'  => 'nullable|string|max:1000',
        ]);

        $newStatus = $data['status'];
        $oldStatus = $order->status;

        if (in_array($oldStatus, ['cancelled', 'delivered']) && $newStatus !== $oldStatus) {
            return back()->with('error', "Cannot change status of a {$oldStatus} order.");
        }

        DB::transaction(function () use ($order, $newStatus, $oldStatus, $store) {
            if ($newStatus === 'confirmed' && $oldStatus === 'pending') {
                $order->load('items.product.inventory');

                foreach ($order->items as $item) {
                    $inventory = Inventory::where('product_id', $item->product_id)->first();
                    if (! $inventory) abort(422, "No inventory record for {$item->product?->name}.");
                    if ($inventory->quantity < $item->quantity) {
                        abort(422, "Insufficient stock for {$item->product?->name}. Available: {$inventory->quantity}.");
                    }
                }

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

                if (! $order->invoice()->exists()) {
                    $commission = (float) $store->commission_rate / 100 * (float) $order->total_amount;
                    Invoice::create([
                        'store_id'           => $store->id,
                        'invoice_number'     => $this->generateInvoiceNumber(),
                        'order_id'           => $order->id,
                        'customer_id'        => $order->customer_id,
                        'total_amount'       => $order->total_amount,
                        'payment_status'     => $order->payment_status,
                        'paid_amount'        => $order->payment_status === 'paid' ? $order->total_amount : 0,
                        'payment_method'     => $order->payment_method,
                        'paid_at'            => $order->payment_status === 'paid' ? now() : null,
                        'due_date'           => now()->addDays(7),
                        'platform_commission'=> $commission,
                    ]);
                }
            }

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
            }
            if ($newStatus === 'cancelled') {
                $updates['cancellation_reason'] = $data['cancellation_reason'] ?? null;
                $updates['cancellation_notes']  = $data['cancellation_notes'] ?? null;
                $updates['cancelled_by']         = 'seller';
                $updates['cancelled_at']         = now();

                // If already paid, flag for refund instead of leaving as paid
                if ($order->payment_status === 'paid') {
                    $updates['payment_status'] = 'to_refund';
                }

                // Void invoice if one exists
                if ($order->invoice) {
                    $order->invoice->update(['payment_status' => 'voided']);
                }
            }
            $order->update($updates);

            if ($newStatus === 'delivered') {
                \App\Services\WalletService::creditOrder($order->fresh());
            }
        });

        // Notify customer on meaningful status changes
        $order->loadMissing('customer');
        $customerUserId = $order->customer?->user_id ?? null;
        if ($customerUserId) {
            $statusNotifs = [
                'confirmed'        => ['Your order has been confirmed!',     "Order {$order->order_number} has been confirmed and is being processed."],
                'preparing'        => ['Your order is being prepared',       "We are now preparing your order {$order->order_number}."],
                'out_for_delivery' => ['Your order is on its way!',          "Order {$order->order_number} is out for delivery."],
                'delivered'        => ['Your order has been delivered!',     "Order {$order->order_number} has been successfully delivered."],
                'cancelled'        => ['Your order has been cancelled',      "Order {$order->order_number} was cancelled by the store."],
            ];
            if (isset($statusNotifs[$newStatus])) {
                [$title, $message] = $statusNotifs[$newStatus];
                NotificationService::send($customerUserId, 'order_update', $title, $message, ['order_id' => $order->id, 'order_number' => $order->order_number]);
            }
        }

        $label = str_replace('_', ' ', $newStatus);
        return back()->with('success', "Order {$order->order_number} marked as " . ucfirst($label) . '.');
    }

    public function markRefunded(Order $order): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        if ($order->payment_status !== 'to_refund') {
            return back()->with('error', 'Order is not pending a refund.');
        }

        $order->update(['payment_status' => 'refunded']);

        return back()->with('success', "Order {$order->order_number} marked as refunded.");
    }

    public function updatePayment(Request $request, Order $order): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'payment_status' => 'required|in:unpaid,paid,partial',
            'payment_method' => 'required|in:cash,gcash,bank_transfer,maya',
        ]);

        $order->update($data);

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

    public function assignDelivery(Request $request, Order $order): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        $data = $request->validate([
            'rider_id' => 'required|exists:users,id',
        ]);

        // Ensure rider belongs to this store
        $rider = User::where('id', $data['rider_id'])
            ->where('store_id', $store->id)
            ->where('sub_role', 'rider')
            ->firstOrFail();

        if ($order->delivery) {
            $order->delivery->update([
                'rider_id'    => $rider->id,
                'assigned_at' => now(),
                'status'      => 'assigned',
            ]);
        } else {
            Delivery::create([
                'order_id'    => $order->id,
                'store_id'    => $store->id,
                'rider_id'    => $rider->id,
                'status'      => 'assigned',
                'assigned_at' => now(),
            ]);
        }

        $order->update(['status' => 'out_for_delivery']);

        return back()->with('success', "Delivery assigned to {$rider->name}.");
    }

    public function destroy(Order $order): RedirectResponse
    {
        $store = request()->attributes->get('seller_store');
        if ($order->store_id !== $store->id) abort(403);

        if (! in_array($order->status, ['cancelled', 'delivered'])) {
            return back()->with('error', 'Only cancelled or delivered orders can be archived.');
        }

        $order->delete();
        return back()->with('success', "Order {$order->order_number} archived.");
    }
}
