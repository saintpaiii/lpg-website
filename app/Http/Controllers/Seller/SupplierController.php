<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Rules\PhPhone;
use App\Services\PurchaseOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** J7: the store's suppliers and what each supplies (unit cost, min qty, preferred). */
class SupplierController extends Controller
{
    private function store(Request $request)
    {
        return $request->attributes->get('seller_store');
    }

    private function own(Request $request, Supplier $supplier): void
    {
        abort_unless($supplier->store_id === $this->store($request)->id, 403);
    }

    public function index(Request $request): Response
    {
        $store = $this->store($request);
        $suppliers = Supplier::where('store_id', $store->id)->with(['products.product:id,name,product_type,weight_kg'])
            ->orderByDesc('is_active')->orderBy('name')->get()
            ->map(fn (Supplier $s) => [
                'id' => $s->id, 'name' => $s->name, 'contact_person' => $s->contact_person, 'phone' => $s->phone, 'email' => $s->email,
                'address' => $s->address, 'lead_time_days' => $s->lead_time_days, 'payment_terms' => $s->payment_terms, 'notes' => $s->notes,
                'is_active' => $s->is_active,
                'products' => $s->products->map(fn (SupplierProduct $l) => [
                    'id' => $l->id, 'product_id' => $l->product_id, 'name' => $l->product?->name, 'unit_cost' => (float) $l->unit_cost,
                    'min_order_qty' => $l->min_order_qty, 'is_preferred' => $l->is_preferred,
                ])->values(),
            ]);

        return Inertia::render('seller/suppliers', [
            'suppliers' => $suppliers,
            'products'  => Product::where('store_id', $store->id)->orderBy('name')->get(['id', 'name', 'product_type', 'cost_price'])
                ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'product_type' => $p->product_type ?? 'lpg', 'cost_price' => (float) $p->cost_price]),
            // K6: owner-only by default (inventory.suppliers is in the Purchase approvals module); the rest see it read-only
            'canManage' => PurchaseOrderController::abilities($request->user())['suppliers'],
            'balances'  => (object) \App\Services\SupplierPaymentService::bySupplier($store->id),
        ]);
    }

    private function rules(): array
    {
        return [
            'name'           => 'required|string|max:255',
            'contact_person' => 'nullable|string|max:255',
            'phone'          => ['nullable', 'string', 'max:30', new PhPhone()],   // landline OK
            'email'          => 'nullable|email|max:255',
            'address'        => 'nullable|string|max:500',
            'lead_time_days' => 'required|integer|min:0|max:90',
            'payment_terms'  => 'nullable|string|max:50',
            'notes'          => 'nullable|string|max:1000',
            'is_active'      => 'nullable|boolean',
        ];
    }

    public function storeSupplier(Request $request): RedirectResponse
    {
        $data = $request->validate($this->rules());
        Supplier::create($data + ['store_id' => $this->store($request)->id, 'is_active' => $request->boolean('is_active', true)]);

        return back()->with('success', "Supplier \"{$data['name']}\" added.");
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $this->own($request, $supplier);
        $data = $request->validate($this->rules());
        $supplier->update($data + ['is_active' => $request->boolean('is_active', true)]);

        return back()->with('success', 'Supplier updated.');
    }

    public function destroy(Request $request, Supplier $supplier): RedirectResponse
    {
        $this->own($request, $supplier);
        $supplier->update(['is_active' => false]);
        $supplier->delete();

        return back()->with('success', 'Supplier removed (past purchase orders keep their history).');
    }

    /** Add / update what the supplier supplies (one preferred supplier per product). */
    public function products(Request $request, Supplier $supplier): RedirectResponse
    {
        $this->own($request, $supplier);
        $data = $request->validate([
            'product_id'    => 'required|integer',
            'unit_cost'     => 'required|numeric|min:0|max:999999',
            'min_order_qty' => 'required|integer|min:1|max:9999',
            'is_preferred'  => 'nullable|boolean',
        ]);
        abort_unless(Product::whereKey($data['product_id'])->where('store_id', $supplier->store_id)->exists(), 422, 'That product is not in your store.');

        $link = SupplierProduct::updateOrCreate(['supplier_id' => $supplier->id, 'product_id' => $data['product_id']],
            ['unit_cost' => $data['unit_cost'], 'min_order_qty' => $data['min_order_qty']]);
        // First supplier of a product becomes its preferred one; the toggle moves it
        $first = ! SupplierProduct::where('product_id', $data['product_id'])->where('id', '!=', $link->id)->where('is_preferred', true)->exists();
        if ($request->boolean('is_preferred') || $first) {
            PurchaseOrderService::setPreferred($link);
        } elseif ($request->has('is_preferred')) {
            $link->update(['is_preferred' => false]);
        }

        return back()->with('success', 'Supplier product saved.');
    }

    public function removeProduct(Request $request, Supplier $supplier, SupplierProduct $link): RedirectResponse
    {
        $this->own($request, $supplier);
        abort_unless($link->supplier_id === $supplier->id, 404);
        $link->delete();

        return back()->with('success', 'Removed from this supplier.');
    }
}
