<?php

namespace App\Mail;

use App\Models\Invoice;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The store's invoice, emailed to the customer with the PDF attached (sent by InvoiceService::email, not queued).
 * $kind = issued (on confirm) | paid (once fully paid).
 */
class InvoiceMail extends Mailable
{
    public function __construct(
        public readonly Invoice $invoice,
        public readonly string $kind,
        public readonly string $pdf,
        public readonly bool $hasAccount,
    ) {}

    private function storeName(): string
    {
        return $this->invoice->store?->store_name ?? $this->invoice->seller_name ?? 'your LPG store';
    }

    public function envelope(): Envelope
    {
        $subject = "Invoice {$this->invoice->invoice_number} from {$this->storeName()}";

        return new Envelope(subject: $this->kind === 'paid' ? "Paid — {$subject}" : $subject);
    }

    public function content(): Content
    {
        $order = $this->invoice->order()->withTrashed()->first();

        return new Content(
            view: 'emails.invoice',
            with: [
                'kind'        => $this->kind,
                'storeName'   => $this->storeName(),
                'number'      => $this->invoice->invoice_number,
                'orderNumber' => $order?->order_number,
                'total'       => (float) ($this->invoice->grand_total ?? $order?->grandTotal() ?? $this->invoice->total_amount),
                'status'      => $this->invoice->payment_status,
                'customer'    => $this->invoice->customer?->name,
                'url'         => $this->hasAccount ? url("/customer/invoices/{$this->invoice->id}") : null,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdf, "{$this->invoice->invoice_number}.pdf")->withMime('application/pdf'),
        ];
    }
}
