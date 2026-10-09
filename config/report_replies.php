<?php

/*
|--------------------------------------------------------------------------
| Quick replies on report reply boxes (inserted into the text box, never sent automatically)
|--------------------------------------------------------------------------
| Roles: customer, store, rider, admin.  Each item: ['label' => chip text, 'text' => message].
|  - common:     shown on every (non-website) report for that role ("General")
|  - categories: per report category ("Suggested")
|  - system:     website problem reports ("Suggested")
| Store users also get their store's saved chat replies ("Your saved replies").
*/

$r = fn (string $label, string $text) => ['label' => $label, 'text' => $text];

return [
    'common' => [
        'store' => [
            $r("We're checking", "Thank you for reporting this. We're checking it now and will update you shortly."),
            $r('Please send a photo', 'Could you please send a clear photo of the problem so we can check it?'),
            $r('Sorry for the trouble', "We're sorry for the trouble. We'll make this right."),
        ],
        'admin' => [
            $r('Reviewing', "Thank you. We're reviewing this report and the order records."),
            $r('Need more details', 'Could you share more details or a photo so we can look into this?'),
            $r('Store reminded', "We've reminded the store to respond to your report."),
            $r('Closing', 'Thank you for your patience. This report is now resolved.'),
        ],
        'customer' => [
            $r('Thank you', 'Thank you for the update.'),
            $r('Still waiting', "I'm still waiting for an update on this, please."),
        ],
        'rider' => [
            $r('I was at the address', 'I was at the delivery address at the time of delivery.'),
            $r('Sent a photo', "I've attached a photo as proof."),
        ],
    ],

    'categories' => [
        // ── Customer reports ─────────────────────────────────────────────────
        'gas_leak' => [
            'store' => [
                $r('Close the valve', 'For your safety, please close the tank valve, open doors and windows, and step outside. Our staff is on the way.'),
                $r('Staff on the way', 'Our staff is on the way to check your tank now.'),
                $r('Tank replaced', 'We replaced the tank and regulator. Please confirm if everything is okay now.'),
            ],
            'customer' => [
                $r('Leak stopped', 'The leak has stopped. Thank you.'),
                $r('Still leaking', "It's still leaking. Please help urgently."),
            ],
            'admin' => [
                $r('Following up', "We're following up with the store to make sure your tank is checked as soon as possible."),
                $r('Safety first', 'For your safety, please keep the valve closed and stay away from the tank until it is checked.'),
            ],
        ],
        'wrong_item' => [
            'store' => [
                $r('Will replace', "We're sorry about that. We'll replace the item today."),
                $r('Send photo of item', 'Could you send a photo of the item you received?'),
            ],
            'customer' => [
                $r('Received correct item', "I've received the correct item. Thank you."),
                $r('Photo attached', "I've attached a photo of the item I received."),
            ],
        ],
        'damaged_cylinder' => [
            'store' => [
                $r('Will replace', "We're sorry for the damaged cylinder. We'll replace it as soon as possible."),
                $r('Send photo of damage', 'Could you send a photo showing the damage on the cylinder?'),
            ],
            'customer' => [
                $r('Replacement received', "I've received the replacement cylinder. Thank you."),
                $r('Photo attached', "I've attached a photo of the damage."),
            ],
        ],
        'late_delivery' => [
            'store' => [
                $r('Rider on the way', "We're sorry for the delay. Your rider is on the way."),
                $r('Will do better', "We're sorry for the delay. We're working to make our deliveries faster."),
            ],
            'customer' => [
                $r('Received', "I've received my order. Thank you."),
                $r('Still not here', "My order still hasn't arrived."),
            ],
        ],
        'rider_behavior' => [
            'store' => [
                $r('Talking to rider', "We're sorry about this. We're talking to our rider about it."),
                $r('Thank you for telling us', 'Thank you for telling us. We take this seriously and will make sure it does not happen again.'),
            ],
            'customer' => [
                $r('More details', "Here's more detail about what happened:"),
                $r('Thank you', 'Thank you for looking into this.'),
            ],
        ],
        'wrong_price' => [
            'store' => [
                $r('Will refund difference', "We're sorry for the price error. We'll refund the difference."),
                $r('Checking the price', "We're checking the price on your order now."),
            ],
            'customer' => [
                $r('Receipt attached', "I've attached a photo of my receipt."),
                $r('Refund received', "I've received the refund for the difference. Thank you."),
            ],
        ],
        'paid_not_delivered' => [
            'store' => [
                $r('Checking with rider', "We're checking with our rider now."),
                $r('Refund issued', "We've issued a refund for your payment."),
            ],
            'customer' => [
                $r('Still not received', "I still haven't received my order."),
                $r('Proof of payment', "I've attached my proof of payment."),
            ],
            'admin' => [
                $r('Checking payment', "We're checking the payment and delivery records for this order."),
            ],
        ],
        'fraud' => [
            'admin' => [
                $r('Investigating', "We're investigating this and will keep your details private."),
                $r('Send proof', 'Please send any screenshots, receipts or messages that show what happened.'),
            ],
            'customer' => [
                $r('Proof attached', "I've attached proof of what happened."),
                $r('More details', "Here's more detail about what happened:"),
            ],
        ],
        'fake_product' => [
            'admin' => [
                $r('Send seal photo', 'Please send a clear photo of the seal and the label on the tank.'),
                $r('Checking with store', "We're checking this with the store and the product records."),
            ],
            'customer' => [
                $r('Photo attached', "I've attached photos of the seal and label."),
                $r('Tank set aside', "I've set the tank aside and won't use it."),
            ],
        ],
        'harassment' => [
            'admin' => [
                $r('You are safe to share', "Thank you for telling us. Your report is private and the store won't see it."),
                $r('Send screenshots', 'If you have messages or screenshots, please attach them here.'),
            ],
            'customer' => [
                $r('Screenshots attached', "I've attached screenshots of what happened."),
                $r('Thank you', 'Thank you for looking into this.'),
            ],
        ],
        'store_misconduct' => [
            'admin' => [
                $r('Reviewing', "We're reviewing what happened. The store won't see your report."),
                $r('More details', 'Could you tell us when this happened and who was involved?'),
            ],
            'customer' => [
                $r('More details', "Here's more detail about what happened:"),
                $r('Thank you', 'Thank you for looking into this.'),
            ],
        ],
        'other_customer' => [
            'admin' => [
                $r('Looking into it', "Thank you. We're looking into this now."),
                $r('More details', 'Could you share more details so we can help?'),
            ],
            'customer' => [
                $r('More details', "Here's more detail about the problem:"),
                $r('Photo attached', "I've attached a photo."),
            ],
        ],

        // ── Store reports about a customer ───────────────────────────────────
        'customer_fraud' => [
            'store' => [
                $r('Proof attached', "We've attached the payment records as proof."),
                $r('Payment details', 'The payment reference does not match any payment we received.'),
            ],
            'admin' => [
                $r('Checking payment', "We're checking the payment records for this order."),
                $r('Send records', 'Please attach the payment records or screenshots for this order.'),
            ],
        ],
        'fake_order' => [
            'store' => [
                $r('No one at address', 'Our rider went to the address and no one ordered or received the item.'),
                $r('Proof attached', "We've attached the delivery photo as proof."),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing the order and the customer's history."),
                $r('Delivery proof', 'Please attach the delivery photo or messages with the customer.'),
            ],
        ],
        'unpaid_balance' => [
            'store' => [
                $r('Balance details', 'The customer still has an unpaid balance for this order.'),
                $r('Reminders sent', "We've sent reminders but the customer has not paid."),
            ],
            'admin' => [
                $r('Contacting customer', "We'll contact the customer about the unpaid balance."),
                $r('Send records', 'Please share the payment records for this order.'),
            ],
        ],
        'customer_abusive_store' => [
            'store' => [
                $r('What happened', "Here's what the customer said and did:"),
                $r('Screenshots attached', "We've attached screenshots of the messages."),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing this. Thank you for reporting it."),
                $r('Send screenshots', 'Please attach any messages or screenshots.'),
            ],
        ],
        'other_store' => [
            'store' => [
                $r('More details', "Here's more detail about the problem:"),
                $r('Proof attached', "We've attached proof."),
            ],
            'admin' => [
                $r('Looking into it', "Thank you. We're looking into this now."),
                $r('More details', 'Could you share more details?'),
            ],
        ],

        // ── Rider reports about a customer ───────────────────────────────────
        'wrong_address' => [
            'rider' => [
                $r('Pin was wrong', 'The pin and the address led to a place where the customer was not.'),
                $r('Could not call', 'I tried calling the customer but could not reach them.'),
            ],
            'store' => [
                $r('Will contact customer', "We'll contact the customer to confirm their address."),
                $r('Thank you', 'Thank you for reporting this. We will follow up.'),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing the order address and the delivery records."),
            ],
        ],
        'refused_payment' => [
            'rider' => [
                $r('Refused to pay', 'The customer refused to pay the cash amount on delivery.'),
                $r('Order returned', 'I brought the order back to the store.'),
            ],
            'store' => [
                $r('Will follow up', "We'll follow up with the customer about the payment."),
                $r('Thank you', 'Thank you for reporting this.'),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing this order and the customer's history."),
            ],
        ],
        'customer_no_show' => [
            'rider' => [
                $r('Waited', 'I waited at the address but no one came to receive the order.'),
                $r('Could not call', 'I tried calling the customer but could not reach them.'),
            ],
            'store' => [
                $r('Will reschedule', "We'll contact the customer to reschedule the delivery."),
                $r('Thank you', 'Thank you for waiting and reporting this.'),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing the delivery records for this order."),
            ],
        ],
        'customer_abusive_rider' => [
            'rider' => [
                $r('What happened', "Here's what the customer said and did:"),
                $r('I am safe', 'I am safe and have left the area.'),
            ],
            'store' => [
                $r('Are you okay', 'Thank you for telling us. Are you okay? Please stay safe.'),
                $r('Will follow up', "We'll follow up on this with the platform admin."),
            ],
            'admin' => [
                $r('Reviewing', "We're reviewing this. Thank you for reporting it."),
            ],
        ],
        'other_rider' => [
            'rider' => [
                $r('More details', "Here's more detail about the problem:"),
                $r('Photo attached', "I've attached a photo."),
            ],
            'store' => [
                $r('Thank you', 'Thank you for reporting this. We will follow up.'),
                $r('More details', 'Could you share more details?'),
            ],
            'admin' => [
                $r('Looking into it', "Thank you. We're looking into this now."),
            ],
        ],
    ],

    // Website problem reports
    'system' => [
        'admin' => [
            $r('Looking into it', "Thanks for reporting this. We're looking into the problem."),
            $r('Fixed', "We've fixed the problem. Please try again and let us know."),
            $r('Need screenshot', 'Could you send a screenshot of the error message?'),
            $r("Can't reproduce", "We couldn't reproduce this problem. Could you share the exact steps?"),
        ],
        'customer' => [
            $r('Still happening', 'The problem is still happening.'),
            $r('Works now', 'It works now. Thank you.'),
        ],
        'store' => [
            $r('Still happening', 'The problem is still happening.'),
            $r('Works now', 'It works now. Thank you.'),
        ],
        'rider' => [
            $r('Still happening', 'The problem is still happening.'),
            $r('Works now', 'It works now. Thank you.'),
        ],
    ],
];
