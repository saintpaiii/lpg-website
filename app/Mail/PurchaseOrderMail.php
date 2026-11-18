<?php

namespace App\Mail;

use App\Models\PurchaseOrder;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Attachment;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** J7: a purchase order emailed to the supplier with the PDF attached (sent by PurchaseOrderService::send, not queued). */
class PurchaseOrderMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public PurchaseOrder $po, public string $pdf)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Purchase order {$this->po->po_number} from {$this->po->store?->store_name}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.purchase-order', with: ['po' => $this->po]);
    }

    public function attachments(): array
    {
        return [Attachment::fromData(fn () => $this->pdf, "{$this->po->po_number}.pdf")->withMime('application/pdf')];
    }
}
