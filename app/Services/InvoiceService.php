<?php

namespace App\Services;

use App\Mail\InvoiceMail;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Store;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Store invoices (EOPT Act, RR 7-2024). The STORE is the issuer — never the platform:
 *  - each store has its own serial series "{prefix}-000001" (numbers are never reused: voided / archived invoices keep theirs);
 *  - the seller details and the VAT split are snapshotted when the invoice is issued and never recalculated;
 *  - prices are VAT-inclusive: VAT stores show VATable sales + 12% VAT, Non-VAT stores show no VAT.
 * Invoices issued before this (vat_status null) keep showing as before, with the current store header.
 * Refunds / credit memos are out of scope: a refunded order keeps its invoice.
 */
class InvoiceService
{
    public const VAT_RATE = 12;

    // ── Invoice code (prefix) ─────────────────────────────────────────────────

    /**
     * Invoice code for a store name: uppercase initials of up to 3 words (letters only); when that gives fewer than
     * 2 letters, the next letters of the first word are added (up to 3); no letters → "ST". Never "INV"; when taken,
     * 2, 3, … is appended (max 5 characters).
     *
     * @param  list<string>  $taken  codes already used (compared case-insensitively)
     */
    public static function prefixFor(string $storeName, array $taken = []): string
    {
        $words = array_values(array_filter(array_map(
            fn ($w) => preg_replace('/[^A-Za-z]/', '', $w),
            preg_split('/\s+/', Str::ascii($storeName)) ?: []
        )));

        $base = '';
        foreach (array_slice($words, 0, 3) as $w) {
            $base .= $w[0];
        }
        if (strlen($base) < 2 && $words) {
            $base .= substr($words[0], 1, 3 - strlen($base));
        }
        $base = strtoupper($base) ?: 'ST';
        if (strlen($base) < 2) {
            $base = 'ST';
        }

        $taken = array_map('strtoupper', $taken);
        $taken[] = 'INV';   // old platform-wide series
        $code = $base;
        for ($n = 2; in_array($code, $taken, true); $n++) {
            $code = substr($base, 0, 5 - strlen((string) $n)) . $n;
        }

        return $code;
    }

    /** The store's invoice code; creates one (backfill rule) when the store has none. Call with the store row locked. */
    private static function ensurePrefix(Store $store): string
    {
        if ($store->invoice_prefix) {
            return $store->invoice_prefix;
        }
        $taken  = Store::withTrashed()->whereNotNull('invoice_prefix')->pluck('invoice_prefix')->all();
        $prefix = self::prefixFor((string) $store->store_name, $taken);
        $store->forceFill(['invoice_prefix' => $prefix])->save();

        return $prefix;
    }

    /** "PGC-000014" — the number the store's next invoice will get. */
    public static function nextNumber(Store $store): string
    {
        $prefix = $store->invoice_prefix ?: self::prefixFor((string) $store->store_name,
            Store::withTrashed()->whereNotNull('invoice_prefix')->pluck('invoice_prefix')->all());

        return self::formatNumber($prefix, (int) ($store->invoice_next_number ?: 1));
    }

    private static function formatNumber(string $prefix, int $n): string
    {
        return $prefix . '-' . str_pad((string) $n, 6, '0', STR_PAD_LEFT);
    }

    /** Store has issued a store-series invoice → its invoice code can no longer change. */
    public static function prefixLocked(Store $store): bool
    {
        return Invoice::withTrashed()->where('store_id', $store->id)->whereNotNull('vat_status')->exists();
    }

    // ── VAT ───────────────────────────────────────────────────────────────────

    /**
     * Split a VAT-inclusive total (in centavos, so the parts always add up): ₱1,120.00 → ₱1,000.00 + ₱120.00.
     *
     * @return array{vatable_sales: float, vat_amount: float}
     */
    public static function vatSplit(float $grandTotal): array
    {
        $cents    = (int) round($grandTotal * 100);
        $vatableC = (int) round($cents * 100 / (100 + self::VAT_RATE));

        return ['vatable_sales' => $vatableC / 100, 'vat_amount' => ($cents - $vatableC) / 100];
    }

    // ── Issue ─────────────────────────────────────────────────────────────────

    /**
     * Issue the order's invoice (when it is confirmed). Run INSIDE a DB transaction: the order row is locked so a
     * double confirm can't make two invoices, and the store row is locked so two orders can't get the same number.
     * Returns the existing invoice when there already is one (archived ones included).
     */
    public static function issue(Order $order): ?Invoice
    {
        $locked = Order::whereKey($order->id)->lockForUpdate()->first();
        if (! $locked) {
            return null;
        }
        $existing = Invoice::withTrashed()->where('order_id', $order->id)->first();
        if ($existing) {
            return $existing;
        }

        $store = Store::withTrashed()->whereKey($locked->store_id)->lockForUpdate()->first();
        if (! $store) {
            return null;
        }

        $prefix = self::ensurePrefix($store);
        $seq    = (int) ($store->invoice_next_number ?: 1);
        $store->forceFill(['invoice_next_number' => $seq + 1])->save();

        $grand = $locked->grandTotal();
        $vat   = $store->vat_status === 'vat' ? self::vatSplit($grand) : ['vatable_sales' => null, 'vat_amount' => null];

        return Invoice::create([
            'store_id'       => $store->id,
            'invoice_number' => self::formatNumber($prefix, $seq),
            'order_id'       => $locked->id,
            'customer_id'    => $locked->customer_id,
            'total_amount'   => $locked->total_amount,
            'payment_status' => $locked->payment_status,
            // Unchanged from before: a walk-in / consignment order may already be paid or partly paid
            'paid_amount'    => match ($locked->payment_status) {
                'paid'    => $grand,
                'partial' => (float) ($locked->down_payment_amount ?? 0),
                default   => 0,
            },
            'payment_method' => $locked->payment_method,
            'paid_at'        => $locked->payment_status === 'paid' ? now() : null,
            'due_date'       => now()->addDays(7),
            // Snapshot (never recalculated)
            'vat_status'     => $store->vat_status === 'vat' ? 'vat' : 'non_vat',
            'seller_name'    => $store->registered_name ?: $store->store_name,
            'seller_tin'     => $store->tin,
            'seller_address' => $store->registered_address ?: self::storeAddress($store),
            'buyer_tin'      => $locked->buyer_tin,
            'grand_total'    => $grand,
            'vatable_sales'  => $vat['vatable_sales'],
            'vat_amount'     => $vat['vat_amount'],
        ]);
    }

    public static function storeAddress(?Store $store): string
    {
        if (! $store) {
            return '';
        }

        return implode(', ', array_filter([$store->address, $store->barangay, $store->city, $store->province]));
    }

    // ── One layout everywhere (pages, print, PDF, email) ──────────────────────

    private const METHOD_LABELS = [
        'cash' => 'Cash', 'gcash' => 'GCash', 'maya' => 'Maya', 'bank_transfer' => 'Bank Transfer', 'card' => 'Card',
        'grab_pay' => 'GrabPay', 'credits' => 'Platform Credits', 'credits_partial' => 'Credits + Online',
    ];

    public static function viewData(Invoice $invoice): array
    {
        $invoice->loadMissing(['customer' => fn ($q) => $q->withTrashed(), 'store' => fn ($q) => $q->withTrashed()]);
        // Archived (soft-deleted) orders still belong on their invoice
        $order = $invoice->order()->withTrashed()->with(['items.product', 'coupon', 'customer'])->first();

        $snapshot = $invoice->vat_status !== null;
        $store    = $invoice->store;
        $grand    = $invoice->grand_total !== null
            ? (float) $invoice->grand_total
            : ($order ? $order->grandTotal() : (float) $invoice->total_amount);

        $status = $invoice->payment_status;
        $paid   = $status === 'paid' ? max($grand, (float) $invoice->paid_amount) : (float) $invoice->paid_amount;

        $buyerAddress = null;
        if ($order?->isPickup()) {
            $buyerAddress = 'Pick-up at the store';
        } elseif ($order) {
            $p = $order->deliveryAddressParts();
            $buyerAddress = implode(', ', array_filter([$p['address'], $p['barangay'], $p['city']])) ?: null;
        } elseif ($invoice->customer) {
            $buyerAddress = implode(', ', array_filter([$invoice->customer->address, $invoice->customer->barangay, $invoice->customer->city])) ?: null;
        }

        $items = $order ? $order->items->map(function ($i) use ($order) {
            $p    = $i->product;
            $name = $p?->name ?? 'Item';
            if ($p?->brand && stripos($name, $p->brand) === false) {
                $name = "{$p->brand} {$name}";
            }
            if ($p?->weight_kg && stripos($name, 'kg') === false) {
                $name .= ' ' . rtrim(rtrim(number_format((float) $p->weight_kg, 2), '0'), '.') . 'kg';
            }
            $tx = $i->transaction_type ?? $order->transaction_type;
            $tx = ['refill' => 'Refill', 'new_purchase' => 'New tank'][$tx] ?? null;

            return [
                'description' => $tx ? "{$name} — {$tx}" : $name,
                'qty'         => (int) $i->quantity,
                'unit_price'  => (float) $i->unit_price,
                'amount'      => (float) $i->subtotal,
            ];
        })->values()->all() : [];

        $breakdown = $order?->priceBreakdown() ?? [
            'subtotal' => (float) $invoice->total_amount, 'delivery_fee' => 0, 'store_discount' => 0, 'coupon_code' => null,
            'coupon_discount' => 0, 'coupon_on_delivery' => 0, 'grand_total' => $grand,
        ];
        // The invoice's own total wins (the order total never changes after creation, this just keeps them in step)
        $breakdown['grand_total'] = $grand;

        return [
            'id'          => $invoice->id,
            'number'      => $invoice->invoice_number,
            'issued_at'   => $invoice->created_at?->timezone('Asia/Manila')->format('M d, Y'),
            'due_date'    => $invoice->due_date?->format('M d, Y'),
            'status'      => $status,
            'is_void'     => $status === 'voided',
            'is_old'      => ! $snapshot,
            'vat_status'  => $invoice->vat_status,
            'seller'      => [
                'name'    => $snapshot ? $invoice->seller_name : ($store?->store_name ?? '—'),
                'tin'     => $snapshot ? $invoice->seller_tin : null,
                'address' => $snapshot ? $invoice->seller_address : self::storeAddress($store),
                'phone'   => $store?->phone,
                'email'   => $store?->email,
            ],
            'store_name'  => $store?->store_name ?? ($invoice->seller_name ?? 'our store'),
            'buyer'       => [
                'name'    => $invoice->customer?->name ?? $order?->customer?->name ?? '—',
                'address' => $buyerAddress,
                'phone'   => $invoice->customer?->phone,
                'tin'     => $invoice->buyer_tin,
            ],
            'order'       => $order ? [
                'id'          => $order->id,
                'number'      => $order->order_number,
                'status'      => $order->status,
                'fulfillment' => $order->fulfillment ?? 'delivery',
                'archived'    => $order->trashed(),
            ] : null,
            'items'       => $items,
            'breakdown'   => $breakdown,
            'tax'         => $invoice->vat_status === 'vat' ? [
                'vatable_sales' => (float) $invoice->vatable_sales,
                'vat_amount'    => (float) $invoice->vat_amount,
                'vat_exempt'    => 0.0,
                'zero_rated'    => 0.0,
            ] : null,
            'payment'     => [
                'status'       => $status,
                'method'       => $invoice->payment_method,
                'method_label' => $invoice->payment_method ? (self::METHOD_LABELS[$invoice->payment_method] ?? Str::headline($invoice->payment_method)) : null,
                'paid_at'      => $invoice->paid_at?->timezone('Asia/Manila')->format('M d, Y'),
                'paid_amount'  => round($paid, 2),
                'balance'      => max(0, round($grand - $paid, 2)),
            ],
        ];
    }

    // ── PDF ───────────────────────────────────────────────────────────────────

    /** A4 portrait PDF of the invoice (same data as the pages). */
    public static function pdf(Invoice $invoice): string
    {
        $doc = self::viewData($invoice);

        // Logo only from local storage (no remote assets), as base64
        $logo = null;
        $path = $invoice->store?->logo;
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
        $dompdf->loadHtml(view('pdf.invoice', ['doc' => $doc, 'logo' => $logo])->render(), 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    // ── Email ─────────────────────────────────────────────────────────────────

    /** Invoice::created — store-series invoices only; the paid version when it is already paid. */
    public static function onCreated(Invoice $invoice): void
    {
        if ($invoice->vat_status === null || $invoice->payment_status === 'voided') {
            return;
        }
        self::queueEmail($invoice->id, $invoice->payment_status === 'paid' ? 'paid' : 'issued');
    }

    /** Invoice::updated — became paid (from any payment path) and the paid mail wasn't sent yet. */
    public static function onUpdated(Invoice $invoice): void
    {
        if ($invoice->vat_status === null || ! $invoice->wasChanged('payment_status')
            || $invoice->payment_status !== 'paid' || $invoice->paid_emailed_at !== null) {
            return;
        }
        self::queueEmail($invoice->id, 'paid');
    }

    /** After the commit AND after the response (webhooks / rider app aren't slowed down). Not a queued job. */
    private static function queueEmail(int $invoiceId, string $kind): void
    {
        // Two closures on separate lines: the closure serializer finds a closure by its line, so nesting two
        // arrow functions on one line makes it rebuild the outer one (endless dispatch)
        DB::afterCommit(function () use ($invoiceId, $kind) {
            dispatch(static function () use ($invoiceId, $kind) {
                \App\Services\InvoiceService::email($invoiceId, $kind);
            })->afterResponse();
        });
    }

    /**
     * Send the invoice email with the PDF attached. Never throws (mail / PDF problems are logged).
     * Re-checks everything on a FRESH invoice: never for void invoices or cancelled orders, never twice.
     */
    public static function email(int $invoiceId, string $kind): void
    {
        try {
            $invoice = Invoice::with(['customer' => fn ($q) => $q->withTrashed()->with('user'), 'store' => fn ($q) => $q->withTrashed()])->find($invoiceId);
            if (! $invoice || $invoice->vat_status === null || $invoice->payment_status === 'voided') {
                return;
            }
            $order = $invoice->order()->withTrashed()->first();
            if ($order && $order->status === 'cancelled') {
                return;
            }

            // Became paid before the "issued" mail went out → send only the paid one
            if ($invoice->payment_status === 'paid' && $invoice->paid_emailed_at === null) {
                $kind = 'paid';
            }
            if ($kind === 'paid' && ($invoice->payment_status !== 'paid' || $invoice->paid_emailed_at !== null)) {
                return;
            }
            if ($kind === 'issued' && $invoice->emailed_at !== null) {
                return;
            }

            $to = $invoice->customer?->user?->email ?: $invoice->customer?->email;
            if (! $to) {
                return;
            }

            $pdf = self::pdf($invoice);
            Mail::to($to)->send(new InvoiceMail($invoice, $kind, $pdf, (bool) $invoice->customer?->user_id));

            // Query update — no model events (no loops)
            $now = now();
            Invoice::withTrashed()->whereKey($invoice->id)->update(
                $kind === 'paid'
                    ? ['paid_emailed_at' => $now, 'emailed_at' => $invoice->emailed_at ?? $now]
                    : ['emailed_at' => $now]
            );
        } catch (\Throwable $e) {
            Log::warning('Invoice email failed', ['invoice_id' => $invoiceId, 'kind' => $kind, 'error' => $e->getMessage()]);
        }
    }
}
