<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Concerns\PresentsCommissionInvoices;
use App\Http\Controllers\Controller;
use App\Models\Commission;
use App\Models\CommissionInvoice;
use App\Services\CommissionBillingService;
use App\Services\PayMongoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Seller view of the platform commission invoices billed to their store,
 * paid through the same PayMongo integration as customer orders.
 */
class CommissionController extends Controller
{
    use GeneratesExport, PresentsCommissionInvoices;

    private function ownInvoice(Request $request, CommissionInvoice $invoice): CommissionInvoice
    {
        $store = $request->attributes->get('seller_store');
        abort_if($invoice->store_id !== $store->id, 403);

        return $invoice;
    }

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');
        CommissionBillingService::markOverdue();

        $tab   = $request->get('tab', 'all');
        $base  = CommissionInvoice::where('store_id', $store->id);
        $query = (clone $base)->with('store')->orderByDesc('created_at');

        match ($tab) {
            'unpaid' => $query->whereIn('status', ['pending', 'overdue']),
            'paid'   => $query->whereIn('status', ['paid', 'waived']),
            default  => null,
        };

        $nextDue = (clone $base)->whereIn('status', ['pending', 'overdue'])->orderBy('due_date')->first();

        return Inertia::render('seller/commission', [
            'summary' => [
                'balance_owed'   => CommissionBillingService::outstandingFor($store->id),
                'overdue_amount' => (float) (clone $base)->where('status', 'overdue')->sum('commission_amount'),
                'next_due_date'  => $nextDue?->due_date->format('M d, Y'),
                // Commission earned by the platform on this month's completed orders (invoiced or not)
                'this_month'     => (float) Commission::where('store_id', $store->id)
                    ->whereNotIn('status', ['failed', 'waived'])
                    ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
                    ->sum('commission_amount'),
                'total_paid'     => (float) (clone $base)->where('status', 'paid')->sum('commission_amount'),
                'uninvoiced'     => (float) Commission::where('store_id', $store->id)->where('status', 'pending')->sum('commission_amount'),
                'suspended'      => (bool) $store->commission_suspended,
                'suspend_after'  => CommissionBillingService::suspendAfterDays(),
                'billing_period' => CommissionBillingService::billingPeriod(),
            ],
            'counts' => [
                'all'    => (clone $base)->count(),
                'unpaid' => (clone $base)->whereIn('status', ['pending', 'overdue'])->count(),
                'paid'   => (clone $base)->whereIn('status', ['paid', 'waived'])->count(),
            ],
            'invoices' => $query->paginate(20)->withQueryString()->through(fn (CommissionInvoice $i) => $this->formatInvoice($i)),
            'tab'      => $tab,
        ]);
    }

    public function show(Request $request, CommissionInvoice $invoice): Response
    {
        $this->ownInvoice($request, $invoice);

        // Returning from PayMongo — confirm directly in case the webhook can't reach us
        if ($request->query('payment') === 'success' && $invoice->isUnpaid() && $invoice->paymongo_checkout_id) {
            $this->verifyPayment($invoice);
        }

        CommissionBillingService::markOverdue();
        $invoice->refresh()->load('store');

        return Inertia::render('seller/commission-show', [
            'invoice'       => $this->formatInvoice($invoice),
            'lines'         => $this->invoiceLines($invoice),
            'suspend_after' => CommissionBillingService::suspendAfterDays(),
        ]);
    }

    public function pay(Request $request, CommissionInvoice $invoice): JsonResponse
    {
        $this->ownInvoice($request, $invoice);

        if (! $invoice->isUnpaid()) {
            return response()->json(['error' => 'This invoice is already settled.'], 422);
        }

        try {
            $user    = $request->user();
            $session = app(PayMongoService::class)->createCheckoutSession([
                'reference_number' => $invoice->invoice_number,
                'description'      => "Platform commission — {$invoice->invoice_number}",
                'line_items'       => [[
                    'name'        => "Commission Invoice {$invoice->invoice_number}",
                    'description' => "{$invoice->total_orders} order(s), {$invoice->periodLabel()}",
                    'amount'      => (int) round((float) $invoice->commission_amount * 100),
                    'currency'    => 'PHP',
                    'quantity'    => 1,
                ]],
                'success_url'      => url("/seller/commission/{$invoice->id}?payment=success"),
                'cancel_url'       => url("/seller/commission/{$invoice->id}?payment=cancelled"),
                'customer_name'    => $user->name,
                'customer_email'   => $user->email,
                'customer_phone'   => $user->phone ?? '',
            ]);

            if (empty($session['checkout_url'])) {
                throw new \RuntimeException('PayMongo did not return a checkout URL.');
            }

            $invoice->update(['paymongo_checkout_id' => $session['id']]);

            return response()->json(['checkout_url' => $session['checkout_url']]);
        } catch (\Throwable $e) {
            Log::error('Commission pay error: ' . $e->getMessage(), ['invoice_id' => $invoice->id]);
            return response()->json(['error' => app()->isLocal() ? $e->getMessage() : 'Could not start payment. Please try again later.'], 422);
        }
    }

    public function pdf(Request $request, CommissionInvoice $invoice)
    {
        $this->ownInvoice($request, $invoice);

        return $this->invoicePdf($invoice->load('store'));
    }

    private function verifyPayment(CommissionInvoice $invoice): void
    {
        try {
            $session  = app(PayMongoService::class)->retrieveCheckoutSession($invoice->paymongo_checkout_id);
            $first    = ($session['attributes']['payments'] ?? [])[0] ?? null;

            if (($first['attributes']['status'] ?? null) === 'paid') {
                CommissionBillingService::markPaid($invoice, 'paymongo', $first['id'] ?? $invoice->paymongo_checkout_id);
            }
        } catch (\Throwable $e) {
            Log::warning('Commission payment verify failed: ' . $e->getMessage(), ['invoice_id' => $invoice->id]);
        }
    }
}
