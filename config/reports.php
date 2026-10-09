<?php

/*
|--------------------------------------------------------------------------
| Report categories — the single source of truth
|--------------------------------------------------------------------------
| reporter: who can pick it (customer | store | rider)
| route:    who handles it — store (store handles, admin can watch), admin (admin only; the store
|           never sees it), both (store and admin from the start)
| urgent:   pinned to the top and flagged "URGENT" in notifications
| target:   what the report is about (store | rider | product | customer)
| needs_order:   filed from an order
| offers_refund: the report page offers "Request a refund" when the order qualifies
|
| Shared with the frontend as the `reportCategories` Inertia prop — never hard-code these in React.
*/

$customer = fn (string $label, string $hint, string $route, string $target, bool $refund, bool $urgent = false) => [
    'label' => $label, 'hint' => $hint, 'reporter' => 'customer', 'route' => $route, 'urgent' => $urgent,
    'target' => $target, 'needs_order' => true, 'offers_refund' => $refund,
];
$store = fn (string $label, string $hint) => [
    'label' => $label, 'hint' => $hint, 'reporter' => 'store', 'route' => 'admin', 'urgent' => false,
    'target' => 'customer', 'needs_order' => true, 'offers_refund' => false,
];
$rider = fn (string $label, string $hint) => [
    'label' => $label, 'hint' => $hint, 'reporter' => 'rider', 'route' => 'both', 'urgent' => false,
    'target' => 'customer', 'needs_order' => true, 'offers_refund' => false,
];

return [
    'categories' => [
        // ── Customers: the store handles it ───────────────────────────────────
        'wrong_item'         => $customer('Wrong or missing item', 'You got a different tank, size or brand, or something was missing.', 'store', 'product', true),
        'damaged_cylinder'   => $customer('Damaged cylinder (no gas leak)', 'Dented, rusty or damaged tank, but no gas is leaking.', 'store', 'product', true),
        'late_delivery'      => $customer('Late delivery', 'Your order arrived much later than expected.', 'store', 'store', false),
        'rider_behavior'     => $customer('Rider was rude or unprofessional', "The rider's behavior during the delivery was not okay.", 'store', 'rider', false),
        'wrong_price'        => $customer('I was charged the wrong price', 'The amount you paid is different from the price shown.', 'store', 'store', true),

        // ── Customers: store and admin ────────────────────────────────────────
        'paid_not_delivered' => $customer('I paid but my order never arrived', 'You paid but the order never came. The store and the admin both get this.', 'both', 'store', true),
        'gas_leak'           => $customer('Gas leak or broken valve (safety)', 'Leaking gas, hissing sound or a broken valve. We alert the store and the admin right away.', 'both', 'product', true, true),

        // ── Customers: admin only (the store will not see these) ─────────────
        'fraud'              => $customer('Scam or fraud', 'You think the store is scamming customers.', 'admin', 'store', false),
        'fake_product'       => $customer('Fake, tampered or unsealed tank', 'The seal is broken, the tank looks refilled illegally, or it is not the real brand.', 'admin', 'product', false),
        'harassment'         => $customer('Harassment or threats', 'Someone from the store harassed or threatened you.', 'admin', 'store', false),
        'store_misconduct'   => $customer('Store staff behaved badly', 'A problem with the store owner or staff that you want the admin to look at.', 'admin', 'store', false),
        'other_customer'     => $customer('Something else', 'Any other problem with this order. Only the admin will see it.', 'admin', 'store', false),

        // ── Sellers / store staff about a customer (admin) ───────────────────
        'customer_fraud'         => $store('Scam or fake payment', 'The customer used a fake payment or tried to cheat the store.'),
        'fake_order'             => $store('Fake or prank order', 'The order was not real, or the customer never meant to buy.'),
        'unpaid_balance'         => $store('Refuses to pay the remaining balance', 'The customer will not pay what they still owe for this order.'),
        'customer_abusive_store' => $store('Rude or threatening customer', 'The customer was abusive or threatening to your staff.'),
        'other_store'            => $store('Something else', 'Any other problem with this customer.'),

        // ── Riders about a customer (store and admin) ────────────────────────
        'wrong_address'          => $rider('Fake or wrong address', 'The address or pin led nowhere, or the customer gave a false address.'),
        'refused_payment'        => $rider('Refused to pay (cash on delivery)', 'The customer would not pay the cash amount on delivery.'),
        'customer_no_show'       => $rider('Customer was not there to receive', 'Nobody was there to receive the order and the customer could not be reached.'),
        'customer_abusive_rider' => $rider('Rude or threatening customer', 'The customer was abusive or threatening to you.'),
        'other_rider'            => $rider('Something else', 'Any other problem with this customer or delivery.'),
    ],

    // "Report a website problem" (type system_report) — only the admin handles these
    'system_categories' => [
        'bug'             => ['label' => "Something isn't working (error or bug)", 'hint' => 'A button, page or feature shows an error or does nothing.'],
        'wrong_info'      => ['label' => 'Wrong information is shown', 'hint' => 'A price, total, status or other detail on the site looks wrong.'],
        'payment_problem' => ['label' => 'Payment or checkout problem', 'hint' => "Checkout, online payment or an invoice didn't work as expected."],
        'account_problem' => ['label' => 'Account or login problem', 'hint' => "You can't log in, verify your account or change your details."],
        'slow_page'       => ['label' => "Page is slow or won't load", 'hint' => 'A page takes very long to open or stays blank.'],
        'other_system'    => ['label' => 'Something else', 'hint' => 'Any other problem with the website.'],
    ],

    // Which part of the site, per portal (reporter_side)
    'system_areas' => [
        'customer' => ['Browse products', 'Cart & checkout', 'My orders', 'Messages', 'Loyalty', 'Invoices', 'Refunds', 'Profile & addresses', 'Notifications', 'Other'],
        'store'    => ['Dashboard', 'Products', 'Inventory', 'Orders', 'Deliveries', 'Messages', 'Customer reports', 'Staff', 'Attendance', 'Payroll',
                       'Revenue & reports', 'DSS insights', 'Coupons', 'Commission & invoices', 'Settings', 'Other'],
        'rider'    => ['My deliveries & map', 'Delivery history', 'Messages', 'Attendance', 'Payslips', 'Other'],
    ],

    // Old categories (before this catalog) — shown for old reports, not selectable
    'legacy_labels' => [
        'fraud'         => 'Fraud',
        'fake_product'  => 'Fake / Wrong Product',
        'rude_behavior' => 'Rude Behavior',
        'non_delivery'  => 'Non-Delivery',
        'overpricing'   => 'Overpricing',
        'harassment'    => 'Harassment',
        'counterfeit'   => 'Counterfeit Product',
        'other'         => 'Other',
    ],
];
