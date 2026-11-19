<?php

/*
 * Store subscription plans — features per plan key (single source of truth; prices and limits live in the
 * subscription_plans table so the admin can edit them). 'trial' = the one-time free Premium trial (trial_days long,
 * 14 by default since J9) — Premium MINUS 'branches', so nobody can chain free trials through branches.
 */

$pro     = ['export', 'coupons', 'loyalty', 'payroll', 'custom_roles'];
$premium = [...$pro, 'dss', 'featured', 'branches'];   // J9: branches need a PAID Premium main store

return [
    'features' => [
        'basic'   => [],
        'pro'     => $pro,
        'premium' => $premium,
        'trial'   => array_values(array_diff($premium, ['branches'])),
    ],

    'feature_labels' => [
        'export'       => 'Export (CSV/PDF)',
        'coupons'      => 'Store coupons',
        'loyalty'      => 'Loyalty program',
        'payroll'      => 'Payroll',
        'custom_roles' => 'Custom staff roles',
        'dss'          => 'DSS insights',
        'featured'     => 'Featured badge & top placement',
        'branches'     => 'Branches (more outlets)',
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

    'days'          => 30,   // every paid plan period
    'trial_days'    => 14,   // J9: the free Premium trial (once per store; each approved branch gets its own)
    'reminder_days' => 3,
];
