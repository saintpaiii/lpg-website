<?php

namespace App\Services;

use App\Mail\PaymentReceiptMail;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\PaymentReceipt;
use App\Models\Store;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Acknowledgement receipts (RR 7-2024 "supplementary document", separate from the invoice):
 *  - ONE receipt per payment, issued the moment the money is received, for the amount of THAT payment;
 *  - numbered per store: "{invoice prefix}-AR-000001" (stores.receipt_next_number), numbers are never reused;
 *  - always says "THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.";
 *  - ₱0 payments (coupon-covered / replacement orders) never get one; payments made before this feature get none.
 * Refunds / credit memos are out of scope: a receipt is never reversed or edited, even when the order is refunded later.
 */
class PaymentReceiptService
{
    public const SOURCES = ['online', 'cash_on_delivery', 'cash_at_store', 'seller_recorded', 'walk_in'];

    private const METHOD_LABELS = [
        'cash' => 'Cash', 'gcash' => 'GCash', 'maya' => 'Maya', 'card' => 'Card', 'grab_pay' => 'GrabPay',
        'bank_transfer' => 'Bank transfer', 'credits' => 'Platform credits', 'credits_partial' => 'Credits + online',
    ];

    private const KIND_LABELS = [
        'full' => 'Full payment', 'down_payment' => 'Down payment', 'balance' => 'Balance payment', 'partial' => 'Partial payment',
    ];

    // ── How much of an order is paid ──────────────────────────────────────────

    /**
     * What the customer has paid on this order so far, from the order's own fields (works for orders paid before
     * receipts existed). Callers compare the value before and after a payment to get the amount of THAT payment.
     */
    public static function paidSoFar(Order $order): float
    {
        $grand = $order->grandTotal();

        $paid = match ($order->payment_status) {
            'paid'    => $grand,
            'partial' => max(
                $grand - ($order->remaining_balance !== null
                    ? (float) $order->remaining_balance
                    : $grand - (float) ($order->down_payment_amount ?? 0)),
                (float) (Invoice::withTrashed()->where('order_id', $order->id)->value('paid_amount') ?? 0)
            ),
            default   => 0.0,
        };

        return round(min(max($paid, 0), $grand), 2);
    }

    // ── Issue ─────────────────────────────────────────────────────────────────

    /**
     * Issue the receipt for one payment of $amount. Call it AFTER the order's payment fields were updated.
     * Never throws: it runs in a savepoint inside the caller's transaction (or its own), and a failure is logged and
     * rolled back on its own — the payment itself always stands. Returns null for ₱0 or on failure.
     */
    public static function record(Order $order, float $amount, ?string $method, string $source, ?string $reference = null, ?int $paymentId = null): ?PaymentReceipt
    {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            return null;
        }

        try {
            return DB::transaction(function () use ($order, $amount, $method, $source, $reference, $paymentId) {
                // Store row locked: two payments can't get the same number
                $store = Store::withTrashed()->whereKey($order->store_id)->lockForUpdate()->first();
                if (! $store) {
                    return null;
                }
                $prefix = InvoiceService::ensurePrefix($store);
                $seq    = (int) ($store->receipt_next_number ?: 1);
                $store->forceFill(['receipt_next_number' => $seq + 1])->save();

                $fresh = Order::withTrashed()->find($order->id) ?? $order;
                $grand = $fresh->grandTotal();

                // Paid after this payment: the order's own fields, or the receipts when the order's statuses were
                // left alone (a payment for a cancelled order)
                $receiptsSum = (float) PaymentReceipt::where('order_id', $order->id)->sum('amount') + $amount;
                $paidAfter   = max(self::paidSoFar($fresh), $receiptsSum);
                $balance     = round(max(0, $grand - $paidAfter), 2);

                $isFirst = ! PaymentReceipt::where('order_id', $order->id)->exists();
                $kind = match (true) {
                    $amount >= $grand - 0.004                          => 'full',
                    $balance <= 0                                      => 'balance',
                    $fresh->payment_mode === 'consignment' && $isFirst => 'down_payment',
                    default                                            => 'partial',
                };

                $receipt = PaymentReceipt::create([
                    'receipt_number' => $prefix . '-AR-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT),
                    'store_id'       => $store->id,
                    'order_id'       => $order->id,
                    'customer_id'    => $fresh->customer_id,
                    'invoice_id'     => Invoice::withTrashed()->where('order_id', $order->id)->value('id'),
                    'payment_id'     => $paymentId,
                    'amount'         => $amount,
                    'payment_method' => $method ? Str::limit($method, 30, '') : null,
                    'reference'      => $reference ? Str::limit($reference, 100, '') : null,
                    'source'         => in_array($source, self::SOURCES, true) ? $source : 'seller_recorded',
                    'kind'           => $kind,
                    'balance_after'  => $balance,
                    'received_at'    => now(),
                ]);

                self::queueEmail($receipt->id);

                return $receipt;
            });
        } catch (\Throwable $e) {
            Log::error('Payment receipt could not be issued (the payment itself was saved)', [
                'order_id' => $order->id, 'amount' => $amount, 'source' => $source, 'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    // ── Lists on the order / invoice pages ────────────────────────────────────

    /**
     * @param  'customer'|'seller'|'admin'  $portal  decides the PDF link
     * @return list<array<string, mixed>>
     */
    public static function listFor(Order $order, string $portal): array
    {
        return PaymentReceipt::where('order_id', $order->id)->orderBy('id')->get()->map(fn (PaymentReceipt $r) => [
            'id'             => $r->id,
            'receipt_number' => $r->receipt_number,
            'received_at'    => $r->received_at?->timezone('Asia/Manila')->format('M j, Y g:i A'),
            'amount'         => (float) $r->amount,
            'method_label'   => self::methodLabel($r->payment_method),
            'kind_label'     => self::KIND_LABELS[$r->kind] ?? Str::headline($r->kind),
            'balance_after'  => (float) $r->balance_after,
            'pdf_url'        => "/{$portal}/receipts/{$r->id}/pdf",
        ])->values()->all();
    }

    public static function methodLabel(?string $method): string
    {
        return $method ? (self::METHOD_LABELS[$method] ?? Str::headline($method)) : 'Online payment';
    }

    // ── Document ──────────────────────────────────────────────────────────────

    public static function viewData(PaymentReceipt $receipt): array
    {
        $receipt->loadMissing([
            'store'    => fn ($q) => $q->withTrashed(),
            'customer' => fn ($q) => $q->withTrashed(),
            'invoice'  => fn ($q) => $q->withTrashed(),
        ]);
        $order = $receipt->order()->withTrashed()->with(['customer' => fn ($q) => $q->withTrashed()])->first();
        $store = $receipt->store;

        return [
            'number'       => $receipt->receipt_number,
            'received_at'  => $receipt->received_at?->timezone('Asia/Manila')->format('M j, Y g:i A'),
            'store'        => [
                'name'       => $store ? ($store->registered_name ?: $store->store_name) : '—',
                'vat_status' => $store?->vat_status,
                'tin'        => $store?->tin,
                'address'    => $store ? ($store->registered_address ?: InvoiceService::storeAddress($store)) : null,
                'phone'      => $store?->phone,
            ],
            'store_name'   => $store?->store_name ?? 'our store',
            'customer'     => $receipt->customer?->name ?? $order?->customer?->name ?? 'Customer',
            'amount'       => (float) $receipt->amount,
            'amount_words' => self::amountInWords((float) $receipt->amount),
            'order_number' => $order?->order_number,
            'order_id'     => $order?->id,
            'invoice'      => $receipt->invoice?->invoice_number,
            'method_label' => self::methodLabel($receipt->payment_method),
            'reference'    => $receipt->reference,
            'kind_label'   => self::KIND_LABELS[$receipt->kind] ?? Str::headline($receipt->kind),
            'balance'      => (float) $receipt->balance_after,
        ];
    }

    /** A4 portrait PDF (same look as the invoice PDF; no remote assets). */
    public static function pdf(PaymentReceipt $receipt): string
    {
        $doc = self::viewData($receipt);

        $logo = null;
        $path = $receipt->store?->logo;
        if ($path && Storage::disk('public')->exists($path)) {
            $mime = Storage::disk('public')->mimeType($path) ?: 'image/png';
            if (in_array($mime, ['image/png', 'image/jpeg'], true)) {
                $logo = "data:{$mime};base64," . base64_encode(Storage::disk('public')->get($path));
            }
        }

        $options = new Options();
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml(view('pdf.payment-receipt', ['doc' => $doc, 'logo' => $logo])->render(), 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    /** Inline-PDF HTTP response used by the three portals. */
    public static function pdfResponse(PaymentReceipt $receipt)
    {
        return response(self::pdf($receipt), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => "inline; filename=\"{$receipt->receipt_number}.pdf\"",
        ]);
    }

    // ── Amount in words (plain PHP, no intl) ──────────────────────────────────

    /** 1120.5 → "One thousand one hundred twenty pesos and 50/100" */
    public static function amountInWords(float $amount): string
    {
        $cents  = (int) round($amount * 100);
        $pesos  = intdiv($cents, 100);
        $words  = $pesos === 0 ? 'zero' : self::intToWords($pesos);
        $unit   = $pesos === 1 ? 'peso' : 'pesos';

        return ucfirst($words) . " {$unit} and " . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT) . '/100';
    }

    private static function intToWords(int $n): string
    {
        $ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
            'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        $tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        $below1000 = function (int $x) use ($ones, $tens): string {
            $parts = [];
            if ($x >= 100) {
                $parts[] = $ones[intdiv($x, 100)] . ' hundred';
                $x %= 100;
            }
            if ($x >= 20) {
                $parts[] = $tens[intdiv($x, 10)] . ($x % 10 ? '-' . $ones[$x % 10] : '');
            } elseif ($x > 0) {
                $parts[] = $ones[$x];
            }

            return implode(' ', $parts);
        };

        $parts = [];
        foreach ([1_000_000_000 => 'billion', 1_000_000 => 'million', 1_000 => 'thousand'] as $size => $name) {
            if ($n >= $size) {
                $parts[] = $below1000(intdiv($n, $size) % 1000) . " {$name}";
                $n %= $size;
            }
        }
        if ($n > 0) {
            $parts[] = $below1000($n);
        }

        return implode(' ', $parts);
    }

    // ── Email (same delivery as InvoiceService) ───────────────────────────────

    /** After the commit AND after the response. Not a queued job. */
    private static function queueEmail(int $receiptId): void
    {
        // Two closures on separate lines (the closure serializer finds a closure by its line — see InvoiceService)
        DB::afterCommit(function () use ($receiptId) {
            dispatch(static function () use ($receiptId) {
                \App\Services\PaymentReceiptService::email($receiptId);
            })->afterResponse();
        });
    }

    /** Send the receipt email with the PDF attached. Never throws; never twice for the same receipt. */
    public static function email(int $receiptId): void
    {
        try {
            $receipt = PaymentReceipt::with([
                'customer' => fn ($q) => $q->withTrashed()->with('user'),
                'store'    => fn ($q) => $q->withTrashed(),
            ])->find($receiptId);
            if (! $receipt || $receipt->emailed_at !== null) {
                return;
            }

            $to = $receipt->customer?->user?->email ?: $receipt->customer?->email;
            if (! $to) {
                return;
            }

            $pdf = self::pdf($receipt);
            Mail::to($to)->send(new PaymentReceiptMail($receipt, $pdf, (bool) $receipt->customer?->user_id));

            // Query update — no model events
            PaymentReceipt::whereKey($receipt->id)->update(['emailed_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Payment receipt email failed', ['receipt_id' => $receiptId, 'error' => $e->getMessage()]);
        }
    }
}
