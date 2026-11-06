<?php

/*
 * Store-portal MODULES a staff role can open — key => label, one-line description and the permissions it covers.
 *
 * A role gives each module one level:
 *   'view' = the module's *.view permissions (GET pages and exports)
 *   'full' = all of the module's permissions (also creating / changing / deleting)
 * The owner (role 'seller') always has full access. Per-person "extra access" (user_permissions) can add or
 * remove single permissions on top of the roles (App\Services\StaffAccess).
 *
 * 'actions' = route name → the permission a WRITE on that route needs (checked by the module middleware on top of
 * the module level), so a single extra permission (e.g. inventory.stock_in) allows exactly that action.
 * Write routes not listed here need any non-view permission of the module.
 */
return [
    'modules' => [
        'dashboard' => [
            'label'       => 'Dashboard',
            'description' => 'Sales overview and charts of the store.',
            'permissions' => ['dashboard.view'],
            'view_only'   => true,
        ],
        'products' => [
            'label'       => 'Products',
            'description' => 'Products, prices and reviews. Full access can add, edit, publish and archive products.',
            'permissions' => ['products.view', 'products.create', 'products.edit', 'products.delete', 'products.toggle'],
            'actions'     => [
                'seller.products.store'        => 'products.create',
                'seller.products.update'       => 'products.edit',
                'seller.products.toggle'       => 'products.toggle',
                'seller.products.destroy'      => 'products.delete',
                'seller.products.restore'      => 'products.delete',
                'seller.products.force-delete' => 'products.delete',
            ],
        ],
        'inventory' => [
            'label'       => 'Inventory',
            'description' => 'Stock levels and history. Full access can record stock-in / stock-out and reorder levels.',
            'permissions' => ['inventory.view', 'inventory.stock_in', 'inventory.stock_out', 'inventory.adjust'],
            'actions'     => [
                'seller.inventory.stock-in'      => 'inventory.stock_in',
                'seller.inventory.stock-out'     => 'inventory.stock_out',
                'seller.inventory.reorder-level' => 'inventory.adjust',
            ],
        ],
        'orders' => [
            'label'       => 'Orders & Refunds',
            'description' => 'Orders and refund requests. Full access can create orders, change status and payment, assign riders and handle refunds.',
            'permissions' => ['orders.view', 'orders.create', 'orders.edit', 'orders.confirm', 'orders.cancel', 'orders.delete'],
            'actions'     => [
                'seller.orders.store'   => 'orders.create',
                'seller.orders.payment' => 'orders.edit',
                'seller.orders.destroy' => 'orders.delete',
            ],
        ],
        'deliveries' => [
            'label'       => 'Deliveries',
            'description' => 'Deliveries and the map. Full access can assign riders and update delivery status.',
            'permissions' => ['deliveries.view', 'deliveries.assign', 'deliveries.update_status', 'deliveries.delete'],
            'actions'     => [
                'seller.deliveries.assign' => 'deliveries.assign',
                'seller.deliveries.status' => 'deliveries.update_status',
            ],
        ],
        'invoices' => [
            'label'       => 'Invoices',
            'description' => 'Invoices. Full access can record payments.',
            'permissions' => ['invoices.view', 'invoices.payment', 'invoices.delete'],
            'actions'     => [
                'seller.invoices.record-payment' => 'invoices.payment',
            ],
        ],
        'customers' => [
            'label'       => 'Customers',
            'description' => 'Customer details on orders and deliveries.',
            'permissions' => ['customers.view', 'customers.create', 'customers.edit', 'customers.delete'],
        ],
        'messages' => [
            'label'       => 'Messages',
            'description' => 'Chats with customers and riders. Full access can reply and start chats.',
            'permissions' => ['messages.view', 'messages.reply'],
        ],
        'customer_reports' => [
            'label'       => 'Customer Reports',
            'description' => 'Reports from customers and riders about the store. Full access can reply and resolve them.',
            'permissions' => ['customer_reports.view', 'customer_reports.manage'],
        ],
        'reports' => [
            'label'       => 'Reports',
            'description' => 'Sales reports and exports.',
            'permissions' => ['reports.view', 'reports.export'],
        ],
        'dss' => [
            'label'       => 'DSS Insights',
            'description' => 'Demand forecasts and restock suggestions (Premium plan).',
            'permissions' => ['dss.view', 'dss.manage'],
        ],
        'settings' => [
            'label'       => 'Store Settings',
            'description' => 'Store profile, hours, delivery and payment options. Full access can change them.',
            'permissions' => ['settings.view', 'settings.edit'],
        ],
        'attendance' => [
            'label'       => 'Attendance of other staff',
            'description' => "Everyone's attendance. Full access can clock staff in and out.",
            'permissions' => ['attendance.view', 'attendance.manage'],
        ],
        'payroll' => [
            'label'       => 'Payroll',
            'description' => 'Payslips (Pro plan). Full access can generate payroll; releasing, paying and settings stay with the owner.',
            'permissions' => ['payroll.view', 'payroll.manage'],
        ],
        'loyalty_customers' => [
            'label'       => 'Loyal customers list',
            'description' => 'Loyalty tiers and trust scores of customers (Pro plan).',
            'permissions' => ['loyalty_customers.view'],
            'view_only'   => true,
        ],
    ],

    // Group + description of the permissions added for staff roles (the rest come from the DemoSeeder catalog)
    'new_permissions' => [
        'attendance.view'         => ['Attendance',       "View other staff's attendance"],
        'attendance.manage'       => ['Attendance',       'Clock staff in and out, fix attendance'],
        'payroll.view'            => ['Payroll',          'View payroll'],
        'payroll.manage'          => ['Payroll',          'Generate payroll'],
        'customer_reports.view'   => ['Customer Reports', 'View reports from customers and riders'],
        'loyalty_customers.view'  => ['Loyalty',          'View the loyal customers list'],
    ],

    // The 4 starter roles every store gets (hard-coded levels)
    'starters' => [
        'cashier' => [
            'name' => 'Cashier', 'is_rider' => false,
            'modules' => ['dashboard' => 'view', 'products' => 'view', 'orders' => 'full', 'invoices' => 'full',
                'customers' => 'full', 'messages' => 'full', 'customer_reports' => 'full'],
        ],
        'warehouse' => [
            'name' => 'Warehouse', 'is_rider' => false,
            'modules' => ['dashboard' => 'view', 'products' => 'view', 'inventory' => 'full'],
        ],
        'rider' => [
            'name' => 'Rider', 'is_rider' => true,
            'modules' => ['orders' => 'view', 'customers' => 'view', 'deliveries' => 'view'],
        ],
        'hr' => [
            'name' => 'HR', 'is_rider' => false,
            'modules' => ['dashboard' => 'view', 'orders' => 'view', 'invoices' => 'full', 'reports' => 'view',
                'attendance' => 'full', 'payroll' => 'full', 'loyalty_customers' => 'view'],
        ],
    ],

    // Where a staff member lands after login: the first module they can view, in this order
    'home_order' => [
        'dashboard'  => '/seller/dashboard',
        'orders'     => '/seller/orders',
        'deliveries' => '/seller/deliveries',
        'inventory'  => '/seller/inventory',
        'invoices'   => '/seller/invoices',
        'products'   => '/seller/products',
        'reports'    => '/seller/reports',
        'attendance' => '/seller/attendance',
        'payroll'    => '/seller/payroll',
    ],
];
