<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PayMongoService
{
    private const BASE_URL = 'https://api.paymongo.com/v1';

    private string $secretKey;
    private string $publicKey;
    private string $webhookSecret;

    public function __construct()
    {
        $this->secretKey     = config('paymongo.secret_key', '');
        $this->publicKey     = config('paymongo.public_key', '');
        $this->webhookSecret = config('paymongo.webhook_secret', '');
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private function client(): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withBasicAuth($this->secretKey, '')
            ->withHeaders(['Content-Type' => 'application/json'])
            ->acceptJson()
            ->baseUrl(self::BASE_URL);
    }

    private function throwIfFailed(Response $response, string $context): void
    {
        if ($response->failed()) {
            $errors = $response->json('errors', []);
            $detail = $errors[0]['detail'] ?? $response->body();
            throw new RuntimeException("[PayMongo] {$context}: {$detail}");
        }
    }

    // ── Checkout Session ──────────────────────────────────────────────────────

    /**
     * Create a PayMongo Checkout Session.
     *
     * @param  array{
     *   reference_number: string,
     *   description: string,
     *   line_items: array<array{name:string, description:string, amount:int, currency:string, quantity:int}>,
     *   success_url: string,
     *   cancel_url: string,
     *   customer_name?: string,
     *   customer_email?: string,
     *   customer_phone?: string,
     * } $params
     * @return array{id: string, checkout_url: string}
     */
    public function createCheckoutSession(array $params): array
    {
        $billing = [];
        if (! empty($params['customer_name']))  $billing['name']  = $params['customer_name'];
        if (! empty($params['customer_email'])) $billing['email'] = $params['customer_email'];
        if (! empty($params['customer_phone'])) $billing['phone'] = $params['customer_phone'];

        $payload = [
            'data' => [
                'attributes' => [
                    'send_email_receipt'   => false,
                    'show_description'     => true,
                    'show_line_items'      => true,
                    'reference_number'     => $params['reference_number'],
                    'description'          => $params['description'],
                    'line_items'           => $params['line_items'],
                    'payment_method_types' => ['gcash', 'paymaya', 'card', 'grab_pay'],
                    'success_url'          => $params['success_url'],
                    'cancel_url'           => $params['cancel_url'],
                ],
            ],
        ];

        if (! empty($billing)) {
            $payload['data']['attributes']['billing'] = $billing;
        }

        $response = $this->client()->post('/checkout_sessions', $payload);
        $this->throwIfFailed($response, 'createCheckoutSession');

        $data = $response->json('data');

        return [
            'id'           => $data['id'],
            'checkout_url' => $data['attributes']['checkout_url'],
            'status'       => $data['attributes']['status'] ?? 'active',
        ];
    }

    /**
     * Retrieve a Checkout Session by ID.
     */
    public function retrieveCheckoutSession(string $checkoutSessionId): array
    {
        $response = $this->client()->get("/checkout_sessions/{$checkoutSessionId}");
        $this->throwIfFailed($response, 'retrieveCheckoutSession');

        return $response->json('data');
    }

    // ── Webhook verification ──────────────────────────────────────────────────

    /**
     * Verify the PayMongo webhook signature.
     * Returns the parsed event array if valid, or throws if invalid.
     */
    public function verifyAndParseWebhook(string $rawBody, string $signatureHeader): array
    {
        // Skip verification in sandbox if no webhook secret is set
        if (empty($this->webhookSecret)) {
            return json_decode($rawBody, true) ?? [];
        }

        // Header format: "t={timestamp},te={test_sig}" or "t={timestamp},li={live_sig}"
        $parts     = [];
        $sigValue  = null;
        foreach (explode(',', $signatureHeader) as $part) {
            [$k, $v] = explode('=', $part, 2);
            $parts[$k] = $v;
        }

        $timestamp = $parts['t'] ?? null;
        $signature = $parts['te'] ?? $parts['li'] ?? null; // te = test, li = live

        if (! $timestamp || ! $signature) {
            throw new RuntimeException('Invalid PayMongo signature header');
        }

        $signedPayload = "{$timestamp}.{$rawBody}";
        $expected      = hash_hmac('sha256', $signedPayload, $this->webhookSecret);

        if (! hash_equals($expected, $signature)) {
            throw new RuntimeException('PayMongo signature mismatch');
        }

        return json_decode($rawBody, true) ?? [];
    }

    // ── Payment method mapping ────────────────────────────────────────────────

    /**
     * Map PayMongo payment method type to our local enum value.
     */
    public static function mapPaymentMethod(string $paymongoMethod): string
    {
        return match ($paymongoMethod) {
            'paymaya' => 'maya',
            'gcash'   => 'gcash',
            'card'    => 'card',
            'grab_pay'=> 'grab_pay',
            default   => 'gcash',
        };
    }
}
