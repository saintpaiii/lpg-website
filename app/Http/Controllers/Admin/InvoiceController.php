<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InvoiceController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private function formatInvoice(Invoice $inv): array
    {
        $total   = (float) $inv->total_amount;
        $paid    = (float) $inv->paid_amount;
        $balance = max(0, $total - $paid);

        return [
            'id'             => $inv->id,
            'invoice_number' => $inv->invoice_number,
            'payment_status' => $inv->payment_status,
            'total_amount'   => $total,
            'paid_amount'    => $paid,
            'balance'        => $balance,
            'payment_method' => $inv->payment_method,
            'paid_at'        => $inv->paid_at?->format('M d, Y g:i A'),
            'due_date'       => $inv->due_date?->format('M d, Y'),
            'created_at'     => $inv->created_at->format('M d, Y g:i A'),
            'deleted_at'     => $inv->deleted_at?->format('M d, Y g:i A'),
            'customer' => $inv->customer ? [
                'id'      => $inv->customer->id,
                'name'    => $inv->customer->name,
                'phone'   => $inv->customer->phone,
                'email'   => $inv->customer->email,
                'address' => $inv->customer->address,
                'barangay'=> $inv->customer->barangay,
                'city'    => $inv->customer->city,
            ] : null,
            'order' => $inv->order ? [
                'id'               => $inv->order->id,
                'order_number'     => $inv->order->order_number,
                'status'           => $inv->order->status,
                'transaction_type' => $inv->order->transaction_type,
                'payment_method'   => $inv->order->payment_method,
                'payment_status'   => $inv->order->payment_status,
                'notes'            => $inv->order->notes,
                'ordered_at'       => $inv->order->ordered_at?->format('M d, Y g:i A'),
                'delivered_at'     => $inv->order->delivered_at?->format('M d, Y g:i A'),
                'items' => $inv->order->items->map(fn ($item) => [
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
            ] : null,
        ];
    }

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $tab = $request->input('tab', 'active');

        $query = Invoice::with(['customer', 'order.items.product']);

        if ($tab === 'archived') {
            $query->onlyTrashed();
        }

        if ($payStatus = $request->input('payment_status')) {
            $query->where('payment_status', $payStatus);
        }

        if ($dateFrom = $request->input('date_from')) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo = $request->input('date_to')) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', fn ($cq) => $cq->where('name', 'like', "%{$search}%"))
                  ->orWhereHas('order', fn ($oq) => $oq->where('order_number', 'like', "%{$search}%"));
            });
        }

        $invoices = $query
            ->latest()
            ->paginate(20)
            ->withQueryString()
            ->through(fn ($inv) => $this->formatInvoice($inv));

        $archivedCount = Invoice::onlyTrashed()->count();

        // Summary totals for active tab
        $summary = null;
        if ($tab === 'active') {
            $raw = Invoice::selectRaw("
                COUNT(*) as total_count,
                SUM(total_amount) as total_billed,
                SUM(paid_amount) as total_collected,
                SUM(total_amount - paid_amount) as total_outstanding
            ")->first();

            $summary = [
                'total_count'       => (int) ($raw->total_count ?? 0),
                'total_billed'      => (float) ($raw->total_billed ?? 0),
                'total_collected'   => (float) ($raw->total_collected ?? 0),
                'total_outstanding' => (float) ($raw->total_outstanding ?? 0),
            ];
        }

        return Inertia::render('admin/invoices', [
            'invoices'      => $invoices,
            'tab'           => $tab,
            'archivedCount' => $archivedCount,
            'summary'       => $summary,
            'filters'       => $request->only('payment_status', 'date_from', 'date_to', 'search', 'tab'),
        ]);
    }

    // ── Show ──────────────────────────────────────────────────────────────────

    public function show(Request $request, Invoice $invoice): Response
    {
        $invoice->load(['customer', 'order.items.product']);

        $company = [
            'name'    => Setting::get('company_name', 'LPG Distributor'),
            'address' => Setting::get('company_address', 'Cavite, Philippines'),
            'phone'   => Setting::get('company_phone', ''),
            'email'   => Setting::get('company_email', ''),
        ];

        return Inertia::render('admin/invoice-show', [
            'invoice' => $this->formatInvoice($invoice),
            'company' => $company,
        ]);
    }

    // ── Record Payment ────────────────────────────────────────────────────────

    public function recordPayment(Request $request, Invoice $invoice): RedirectResponse
    {
        $total   = (float) $invoice->total_amount;
        $already = (float) $invoice->paid_amount;
        $maxPay  = $total - $already;

        $data = $request->validate([
            'amount'         => "required|numeric|min:0.01|max:{$maxPay}",
            'payment_method' => 'required|in:cash,gcash,bank_transfer,maya',
            'notes'          => 'nullable|string|max:500',
        ]);

        $newPaid = $already + (float) $data['amount'];
        $status  = $newPaid >= $total ? 'paid' : 'partial';

        $invoice->update([
            'paid_amount'    => $newPaid,
            'payment_status' => $status,
            'payment_method' => $data['payment_method'],
            'paid_at'        => $status === 'paid' ? ($invoice->paid_at ?? now()) : $invoice->paid_at,
        ]);

        // Sync order payment status
        if ($invoice->order) {
            $invoice->order->update([
                'payment_status' => $status,
                'payment_method' => $data['payment_method'],
            ]);
        }

        return back()->with('success', "Payment of ₱" . number_format($data['amount'], 2) . " recorded for {$invoice->invoice_number}.");
    }

    // ── Destroy (soft delete) ─────────────────────────────────────────────────

    public function destroy(Invoice $invoice): RedirectResponse
    {
        $invoice->delete();

        return back()->with('success', "{$invoice->invoice_number} archived.");
    }

    // ── Restore ───────────────────────────────────────────────────────────────

    public function restore(Invoice $invoice): RedirectResponse
    {
        $invoice->restore();

        return back()->with('success', "{$invoice->invoice_number} restored.");
    }

    // ── Force Delete ──────────────────────────────────────────────────────────

    public function forceDestroy(Invoice $invoice): RedirectResponse
    {
        $num = $invoice->invoice_number;
        $invoice->forceDelete();

        return back()->with('success', "{$num} permanently deleted.");
    }
}
