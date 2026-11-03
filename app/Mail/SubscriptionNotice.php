<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Plan emails to a store owner: trial started, payment received, ending soon, ended, free days given. */
class SubscriptionNotice extends Mailable
{
    use Queueable, SerializesModels;

    /** @param  string[]  $lines */
    public function __construct(
        public readonly string $mailSubject,
        public readonly string $heading,
        public readonly array $lines,
        public readonly ?string $buttonText = null,
        public readonly ?string $url = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->mailSubject);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.subscription_notice');
    }
}
