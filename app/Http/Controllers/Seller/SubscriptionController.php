<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\GeneratesExport;
use App\Http\Controllers\Controller;
use App\Models\SubscriptionPayment;
use App\Services\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/** "My Plan" (store owner): current plan, usage, buying / extending a plan through PayMongo, receipts. */
class SubscriptionController extends Controller
{
    use GeneratesExport;

    public function index(Request $request): Response
    {
        $store = $request->attributes->get('seller_store');

        // Back from PayMongo
        if ($id = $request->integer('p')) {
            $payment = SubscriptionPayment::where('store_id', $store->id)->find($id);
            if ($payment && $request->get('payment') === 'success') {
                if (SubscriptionService::verifyCheckout($payment)) {
                    $store->refresh();
                    session()->now('success', 'Payment received — your ' . SubscriptionService::planName($store->subscription_plan)
                        . ' plan is active until ' . $store->subscription_expires_at->format('M j, Y') . '.');
                } else {
                    session()->now('info', 'Payment is still processing… Your plan updates as soon as PayMongo confirms it.');
                }
            } elseif ($payment && $request->get('payment') === 'cancelled') {
                if ($payment->status === 'pending') {
                    $payment->update(['status' => 'cancelled']);
                }
                session()->now('info', 'Payment cancelled — nothing was charged.');
            }
        }
        $store->refresh();
        Cache::forget(SubscriptionService::summaryCacheKey($store->id));

        $payments = SubscriptionPayment::where('store_id', $store->id)
            ->whereIn('status', ['paid', 'pending', 'awaiting_seller', 'declined'])
            ->latest('id')
            ->paginate(10)
            ->withQueryString()
            ->through(fn (SubscriptionPayment $p) => [
                'id'             => $p->id,
                'receipt_number' => $p->receipt_number,
                'plan'           => SubscriptionService::planName($p->plan_key),
                'amount'         => (float) $p->amount,
                'method'         => $p->method,
                'method_label'   => SubscriptionService::methodLabel($p->method),
                'period'         => SubscriptionService::periodLabel($p->period_start, $p->period_end),
                'paid_at'        => $p->paid_at?->format('M j, Y g:i A'),
                'status'         => $p->status,
                'notes'          => $p->notes,
            ]);

        return Inertia::render('seller/plan', [
            'plan'     => SubscriptionService::summary($store),
            'catalog'  => SubscriptionService::publicPlans(),
            'usage'    => SubscriptionService::usage($store),
            'paused'   => SubscriptionService::pausedCounts($store),
            // What each plan would pause / lock (null = nothing changes)
            'previews' => collect(SubscriptionService::PLAN_KEYS)->mapWithKeys(function (string $key) use ($store) {
                $preview = SubscriptionService::previewPause($store, $key);

                return [$key => SubscriptionService::previewHasChanges($preview) ? $preview : null];
            })->all(),
            'payments' => $payments,
            'choose'   => in_array($request->get('choose'), SubscriptionService::PLAN_KEYS, true) ? $request->get('choose') : null,
            // Cash recorded by the platform admin, waiting for this owner to accept / decline (null = none)
            'cash_request' => ($cash = SubscriptionService::waitingCash($store)) ? SubscriptionService::cashRequestData($cash, $store) : null,
        ]);
    }

    /** Accept the admin's cash payment → the plan starts / extends now. */
    public function acceptCash(Request $request, SubscriptionPayment $payment): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($payment->store_id === $store->id, 404);
        $data = $request->validate([
            'shown_plan'    => 'required|string|max:20',
            'shown_ends_at' => 'nullable|string|max:40',
        ]);

        $result = SubscriptionService::acceptCash($payment, $store, $request->user(), $data['shown_plan'], $data['shown_ends_at'] ?? null);

        if ($result === 'changed') {
            return back()->with('error', 'Your plan changed — please review the request again.');
        }
        if ($result === 'gone') {
            return back()->with('error', 'This request is no longer waiting.');
        }
        $store->refresh();

        return back()->with('success', 'Your ' . SubscriptionService::planName($store->subscription_plan) . ' plan is active until '
            . $store->subscription_expires_at->format('M j, Y') . '.');
    }

    /** Decline the admin's cash payment → nothing changes; admins are told to return the cash. */
    public function declineCash(Request $request, SubscriptionPayment $payment): RedirectResponse
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($payment->store_id === $store->id, 404);
        $data = $request->validate(['reason' => 'nullable|string|max:255']);

        return SubscriptionService::declineCash($payment, trim((string) ($data['reason'] ?? '')) ?: null)
            ? back()->with('success', 'Declined — nothing changed.')
            : back()->with('error', 'This request is no longer waiting.');
    }

    /** Start a PayMongo checkout → { checkout_url } */
    public function checkout(Request $request): JsonResponse
    {
        $data  = $request->validate(['plan_key' => 'required|string|in:' . implode(',', SubscriptionService::PLAN_KEYS)]);
        $store = $request->attributes->get('seller_store');

        $result = SubscriptionService::createCheckout($store, $request->user(), $data['plan_key']);

        return isset($result['error'])
            ? response()->json(['message' => $result['error']], 422)
            : response()->json(['checkout_url' => $result['checkout_url']]);
    }

    public function receipt(Request $request, SubscriptionPayment $payment): HttpResponse
    {
        $store = $request->attributes->get('seller_store');
        abort_unless($payment->store_id === $store->id && $payment->status === 'paid' && $payment->receipt_number, 404);

        return $this->pdfResponse("{$payment->receipt_number}.pdf", SubscriptionService::receiptViewData($payment->load('store')));
    }
}
