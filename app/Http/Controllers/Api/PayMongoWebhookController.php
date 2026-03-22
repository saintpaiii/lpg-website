<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Services\PayMongoService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class PayMongoWebhookController extends Controller
{
    public function handle(Request $request): Response
    {
        $rawBody   = $request->getContent();
        $sigHeader = $request->header('Paymongo-Signature', '');

        try {
            $paymongo = app(PayMongoService::class);
            $event    = $paymongo->verifyAndParseWebhook($rawBody, $sigHeader);
        } catch (\Throwable $e) {
            Log::warning('PayMongo webhook signature invalid: ' . $e->getMessage());
            return response('Unauthorized', 401);
        }

        $type = $event['data']['attributes']['type'] ?? null;

        if ($type === 'checkout_session.payment.paid') {
            $this->handleCheckoutPaid($event);
        }

        return response('OK', 200);
    }

    private function handleCheckoutPaid(array $event): void
    {
        $attributes = $event['data']['attributes']['data']['attributes'] ?? [];
        $sessionId  = $event['data']['attributes']['data']['id'] ?? null;

        if (! $sessionId) {
            return;
        }

        $payments = Payment::where('paymongo_checkout_id', $sessionId)->get();
        if ($payments->isEmpty()) {
            return;
        }

        // Extract payment method from PayMongo payments array
        $pmPayments     = $attributes['payments'] ?? [];
        $firstPm        = $pmPayments[0] ?? [];
        $paymongoMethod = $firstPm['data']['attributes']['source']['type'] ?? null;
        $paymongoPayId  = $firstPm['data']['id'] ?? null;
        $localMethod    = $paymongoMethod ? PayMongoService::mapPaymentMethod($paymongoMethod) : null;

        foreach ($payments as $payment) {
            if ($payment->status === 'paid') {
                continue;
            }

            $payment->update([
                'status'              => 'paid',
                'paymongo_payment_id' => $paymongoPayId,
                'payment_method'      => $localMethod,
                'paid_at'             => now(),
            ]);

            $order = $payment->order;
            if (! $order) {
                continue;
            }

            $order->update([
                'payment_status' => 'paid',
                'payment_method' => $localMethod,
            ]);

            $invoice = $order->invoice;
            if ($invoice) {
                $invoice->update([
                    'payment_status' => 'paid',
                    'paid_amount'    => $order->total_amount,
                    'paid_at'        => now(),
                    'payment_method' => $localMethod,
                ]);
            }
        }
    }
}
