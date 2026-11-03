<?php

/*
 * Store subscription plans — features per plan key (single source of truth; prices and limits live in the
 * subscription_plans table so the admin can edit them). 'trial' = the one-time 30-day Premium trial.
 */

$pro     = ['export', 'coupons', 'loyalty', 'payroll', 'custom_roles'];
$premium = [...$pro, 'dss', 'featured'];

return [
    'features' => [
        'basic'   => [],
        'pro'     => $pro,
        'premium' => $premium,
        'trial'   => $premium,
    ],

    'feature_labels' => [
        'export'       => 'Export (CSV/PDF)',
        'coupons'      => 'Store coupons',
        'loyalty'      => 'Loyalty program',
        'payroll'      => 'Payroll',
        'custom_roles' => 'Custom staff roles',
        'dss'          => 'DSS insights',
        'featured'     => 'Featured badge & top placement',
    ],

    // What every plan includes
    'core_features' => [
        'Products with photos & video',
        'Orders',
        'Deliveries & map',
        'Inventory',
        'Invoices',
        'Messages',
        'Refunds',
        'Reviews',
        'Staff & Attendance',
        'Store documents',
        'Sales reports',
    ],

    'days'          => 30,
    'trial_days'    => 30,
    'reminder_days' => 3,
];
