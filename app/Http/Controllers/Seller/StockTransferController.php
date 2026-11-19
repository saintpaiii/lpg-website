<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Services\BranchService;
use App\Services\StockService;
use App\Services\StockTransferService;
use App\Support\StoreContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * J9 — stock transfers between the owner's stores. Sending needs the MAIN store's paid Premium (route middleware
 * plan.feature:branches); receiving / cancelling a transfer that is already on the way always works (stock is never
 * stuck in transit because a plan lapsed).
 */
class StockTransferController extends Controller
{
    /** GET seller/transfers/options?from_store_id=&to_store_id= — products of both stores for the New transfer form. */
    public function choices(Request $request): JsonResponse
    {
        $user = $request->user();
        $active = $request->attributes->get('seller_store');
        $stores = StoreContext::approvedStores((int) $active->user_id);
        $from = $stores->firstWhere('id', (int) $request->query('from_store_id', $active->id)) ?? $active;
        abort_unless(StockTransferService::canSendFrom($user, $from), 403, "You can't send stock from this store.");
        $to = $stores->firstWhere('id', (int) $request->query('to_store_id'));

        $fromProducts = Product::where('store_id', $from->id)->where('is_active', true)->orderBy('name')->get();
        $usable = StockService::usableMap($fromProducts->pluck('id'));
        $empties = Inventory::whereIn('product_id', $fromProducts->pluck('id'))->pluck('empty_quantity', 'product_id');
        $toProducts = $to ? Product::where('store_id', $to->id)->orderBy('name')->get() : collect();

        return response()->json([
            'stores' => $stores->map(fn (Store $s) => ['id' => $s->id, 'name' => $s->store_name])->values(),
            'from_store_id' => $from->id,
            'to_store_id'   => $to?->id,
            'from' => $fromProducts->map(fn (Product $p) => [
                'id' => $p->id, 'name' => $p->name, 'type' => $p->product_type, 'is_lpg' => ! $p->isAccessory(),
                'usable' => (int) ($usable[$p->id] ?? 0), 'empties' => (int) ($empties[$p->id] ?? 0),
                'suggest_to' => $to ? StockTransferService::suggest($p, $to)?->id : null,
            ])->values(),
            'to' => $toProducts->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name, 'type' => $p->product_type, 'active' => (bool) $p->is_active])->values(),
        ]);
    }

    /** POST seller/transfers — send. */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'from_store_id'          => ['required', 'integer'],
            'to_store_id'            => ['required', 'integer', 'different:from_store_id'],
            'notes'                  => ['nullable', 'string', 'max:500'],
            'lines'                  => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.from_product_id'=> ['required', 'integer'],
            'lines.*.to_product_id'  => ['required', 'integer'],
            'lines.*.quantity'       => ['required', 'integer', 'min:1', 'max:100000'],
            'lines.*.empties'        => ['nullable', 'boolean'],
        ], [
            'to_store_id.different' => 'Choose a different store to send to.',
            'lines.required'        => 'Add at least one product.',
            'lines.*.to_product_id.required' => 'Choose the product in the receiving store.',
        ]);
        $owner = (int) $request->attributes->get('seller_store')->user_id;
        $from = Store::where('user_id', $owner)->find($data['from_store_id']);
        $to = Store::find($data['to_store_id']);
        if (! $from || ! $to || (int) $to->user_id !== $owner) {
            return back()->withErrors(['to_store_id' => 'You can only transfer between your own approved stores.']);
        }
        $t = StockTransferService::send($request->user(), $from, $to, $data['lines'], $data['notes'] ?? null);

        return back()->with('success', "{$t->transfer_number} sent to {$to->store_name}.");
    }

    /** POST seller/transfers/{transfer}/receive — received[item id] = qty. */
    public function receive(Request $request, StockTransfer $transfer): RedirectResponse
    {
        $data = $request->validate(['received' => ['nullable', 'array'], 'received.*' => ['integer', 'min:0']]);
        StockTransferService::receive($transfer, $request->user(), array_map('intval', $data['received'] ?? []));
        $transfer->refresh();
        $lost = (int) $transfer->items()->sum(\Illuminate\Support\Facades\DB::raw('quantity - COALESCE(quantity_received, 0)'));

        return back()->with($lost > 0 ? 'warning' : 'success', "{$transfer->transfer_number} received."
            . ($lost > 0 ? " {$lost} missing — recorded at the sending store as lost in transfer." : ''));
    }

    public function cancel(Request $request, StockTransfer $transfer): RedirectResponse
    {
        StockTransferService::cancel($transfer, $request->user());

        return back()->with('success', "{$transfer->transfer_number} cancelled — the stock is back at the sending store.");
    }

    /** POST seller/transfers/create-product — "Create it in the destination" (name, size, brand, prices; stock 0). */
    public function createProduct(Request $request): JsonResponse
    {
        $data = $request->validate(['from_product_id' => ['required', 'integer'], 'to_store_id' => ['required', 'integer']]);
        $p = Product::findOrFail($data['from_product_id']);
        $from = Store::findOrFail($p->store_id);
        $to = Store::findOrFail($data['to_store_id']);
        abort_unless((int) $to->user_id === (int) $from->user_id && StockTransferService::canSendFrom($request->user(), $from), 403);
        $copy = StockTransferService::suggest($p, $to) ?? BranchService::copyProduct($p, $to);

        return response()->json(['id' => $copy->id, 'name' => $copy->name, 'type' => $copy->product_type, 'active' => (bool) $copy->is_active]);
    }

    /** GET seller/transfers/{transfer}/pdf — the printable transfer slip. */
    public function pdf(Request $request, StockTransfer $transfer)
    {
        abort_unless(StockTransferService::canView($request->user(), $transfer), 403);
        $data = StockTransferService::slipData($transfer);
        $pdf = \App\Services\PurchaseOrderService::renderPdf('pdf.transfer-slip', $data + ['logo' => \App\Services\PurchaseOrderService::logo($data['from'])]);

        return response($pdf, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => ($request->boolean('download') ? 'attachment' : 'inline') . "; filename=\"{$transfer->transfer_number}.pdf\"",
        ]);
    }
}
