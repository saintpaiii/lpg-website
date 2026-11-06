<?php

namespace App\Mail;

use App\Models\PaymentReceipt;
use App\Services\PaymentReceiptService;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The store's acknowledgement receipt for one payment, with the PDF attached (sent by PaymentReceiptService::email,
 * not queued). One email per receipt.
 */
class PaymentReceiptMail extends Mailable
{
    public function __construct(
        public readonly PaymentReceipt $receipt,
        public readonly string $pdf,
        public readonly bool $hasAccount,
    ) {}

    public function envelope(): Envelope
    {
        $doc = PaymentReceiptService::viewData($this->receipt);

        return new Envelope(
            subject: 'Payment received — ₱' . number_format($doc['amount'], 2) . " for {$doc['order_number']} ({$doc['store_name']})",
        );
    }

    public function content(): Content
    {
        $doc = PaymentReceiptService::viewData($this->receipt);

        return new Content(
            view: 'emails.payment-receipt',
            with: [
                'doc' => $doc,
                'url' => $this->hasAccount && $doc['order_id'] ? url("/customer/orders/{$doc['order_id']}") : null,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdf, "{$this->receipt->receipt_number}.pdf")->withMime('application/pdf'),
        ];
    }
}
