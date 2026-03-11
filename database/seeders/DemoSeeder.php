<?php

namespace Database\Seeders;

use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Comprehensive demo seeder for thesis defense.
 * Run with: php artisan migrate:fresh --seed
 *
 * Inserts:
 *  - 2 admin accounts + 3 riders
 *  - 5 active products + 1 archived product
 *  - 15 active customers + 1 archived customer
 *  - 50 orders spread over 60 days (various statuses)
 *  - Matching order_items, invoices, deliveries, inventory_transactions
 *  - 6 settings (company info + DSS defaults)
 */
class DemoSeeder extends Seeder
{
    private Carbon $now;
    private int    $orderSeq   = 0;
    private int    $invoiceSeq = 0;

    /** Track units consumed per product index (for opening-stock math) */
    private array $consumed = [0, 0, 0, 0, 0];

    public function run(): void
    {
        $this->now = Carbon::now();

        // ── 1. Users ──────────────────────────────────────────────────────────
        $adminId = DB::table('users')->insertGetId([
            'name'              => 'LPG Admin',
            'email'             => 'admin@lpg.com',
            'password'          => Hash::make('password123'),
            'role'              => 'admin',
            'is_admin'          => true,
            'is_active'         => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now,
            'updated_at'        => $this->now,
        ]);

        // Original thesis admin account (preserved)
        DB::table('users')->insert([
            'name'              => 'Saint Joseph Dela Cruz',
            'email'             => 'delacruz.saintjoseph@ncst.edu.ph',
            'password'          => Hash::make('Ncst@1234'),
            'role'              => 'admin',
            'is_admin'          => true,
            'is_active'         => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now,
            'updated_at'        => $this->now,
        ]);

        $riderData = [
            ['Juan Andres',  'rider1@lpg.com', '09171234501'],
            ['Pedro Santos',  'rider2@lpg.com', '09281234502'],
            ['Marco Reyes',   'rider3@lpg.com', '09391234503'],
        ];
        $riderIds = [];
        foreach ($riderData as [$name, $email, $phone]) {
            $riderIds[] = DB::table('users')->insertGetId([
                'name'              => $name,
                'email'             => $email,
                'password'          => Hash::make('password123'),
                'phone'             => $phone,
                'role'              => 'rider',
                'is_admin'          => false,
                'is_active'         => true,
                'email_verified_at' => $this->now,
                'created_at'        => $this->now,
                'updated_at'        => $this->now,
            ]);
        }

        // Sample manager, cashier, warehouse accounts
        $managerId = DB::table('users')->insertGetId([
            'name'              => 'Ana Reyes (Manager)',
            'email'             => 'manager@lpg.com',
            'password'          => Hash::make('password123'),
            'phone'             => '09201234567',
            'role'              => 'manager',
            'is_admin'          => false,
            'is_active'         => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now,
            'updated_at'        => $this->now,
        ]);

        $cashierId = DB::table('users')->insertGetId([
            'name'              => 'Ben Cruz (Cashier)',
            'email'             => 'cashier@lpg.com',
            'password'          => Hash::make('password123'),
            'phone'             => '09211234568',
            'role'              => 'cashier',
            'is_admin'          => false,
            'is_active'         => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now,
            'updated_at'        => $this->now,
        ]);

        $warehouseId = DB::table('users')->insertGetId([
            'name'              => 'Carlo Tan (Warehouse)',
            'email'             => 'warehouse@lpg.com',
            'password'          => Hash::make('password123'),
            'phone'             => '09221234569',
            'role'              => 'warehouse',
            'is_admin'          => false,
            'is_active'         => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now,
            'updated_at'        => $this->now,
        ]);

        // ── 1b. Permissions ───────────────────────────────────────────────────
        $permDefs = [
            // [name, group, description]
            ['dashboard.view',            'Dashboard',        'View the admin dashboard'],

            ['customers.view',            'Customers',        'View customer list and profiles'],
            ['customers.create',          'Customers',        'Create new customers'],
            ['customers.edit',            'Customers',        'Edit existing customers'],
            ['customers.delete',          'Customers',        'Archive / delete customers'],

            ['products.view',             'Products',         'View products and pricing'],
            ['products.create',           'Products',         'Add new products'],
            ['products.edit',             'Products',         'Edit product details'],
            ['products.delete',           'Products',         'Archive / delete products'],
            ['products.toggle',           'Products',         'Toggle product active status'],

            ['inventory.view',            'Inventory',        'View stock levels and transactions'],
            ['inventory.stock_in',        'Inventory',        'Record stock-in (receive goods)'],
            ['inventory.stock_out',       'Inventory',        'Record manual stock-out'],
            ['inventory.adjust',          'Inventory',        'Adjust reorder levels'],

            ['orders.view',               'Orders',           'View orders list and details'],
            ['orders.create',             'Orders',           'Create new orders'],
            ['orders.edit',               'Orders',           'Edit order details / payment'],
            ['orders.confirm',            'Orders',           'Confirm / advance order status'],
            ['orders.cancel',             'Orders',           'Cancel orders'],
            ['orders.delete',             'Orders',           'Archive / delete orders'],

            ['deliveries.view',           'Deliveries',       'View delivery list and details'],
            ['deliveries.assign',         'Deliveries',       'Assign riders to orders'],
            ['deliveries.update_status',  'Deliveries',       'Update delivery status'],
            ['deliveries.delete',         'Deliveries',       'Archive / delete deliveries'],

            ['invoices.view',             'Invoices',         'View invoices'],
            ['invoices.payment',          'Invoices',         'Record invoice payments'],
            ['invoices.delete',           'Invoices',         'Archive / delete invoices'],

            ['reports.view',              'Reports',          'View reports and analytics'],
            ['reports.export',            'Reports',          'Export reports to PDF / CSV'],

            ['dss.view',                  'DSS',              'View DSS insights and forecasts'],
            ['dss.manage',                'DSS',              'Run and configure DSS models'],

            ['users.view',                'User Management',  'View staff list and profiles'],
            ['users.create',              'User Management',  'Create new staff accounts'],
            ['users.edit',                'User Management',  'Edit staff account details'],
            ['users.delete',              'User Management',  'Archive / delete staff accounts'],
            ['users.permissions',         'User Management',  'Manage per-user permission overrides'],

            ['settings.view',             'Settings',         'View system settings'],
            ['settings.edit',             'Settings',         'Edit system settings'],
        ];

        $permIds = []; // name => id
        foreach ($permDefs as [$name, $group, $desc]) {
            $permIds[$name] = DB::table('permissions')->insertGetId([
                'name'        => $name,
                'group'       => $group,
                'description' => $desc,
                'created_at'  => $this->now,
                'updated_at'  => $this->now,
            ]);
        }

        // ── 1c. Role Permissions ──────────────────────────────────────────────
        $allPerms = array_keys($permIds);

        $managerExcluded = ['users.view','users.create','users.edit','users.delete','users.permissions','settings.view','settings.edit'];

        $cashierPerms = [
            'dashboard.view',
            'customers.view','customers.create','customers.edit',
            'products.view',
            'orders.view','orders.create','orders.edit','orders.confirm','orders.cancel',
            'invoices.view','invoices.payment',
        ];

        $warehousePerms = [
            'dashboard.view',
            'products.view',
            'inventory.view','inventory.stock_in','inventory.stock_out','inventory.adjust',
        ];

        $riderPerms = [
            'deliveries.view','deliveries.update_status',
            'orders.view',
            'customers.view',
        ];

        $customerPerms = ['products.view','orders.view'];

        $rolePermMap = [
            'admin'     => $allPerms,
            'manager'   => array_values(array_diff($allPerms, $managerExcluded)),
            'cashier'   => $cashierPerms,
            'warehouse' => $warehousePerms,
            'rider'     => $riderPerms,
            'customer'  => $customerPerms,
        ];

        foreach ($rolePermMap as $role => $perms) {
            foreach ($perms as $permName) {
                if (! isset($permIds[$permName])) continue;
                DB::table('role_permissions')->insert([
                    'role'          => $role,
                    'permission_id' => $permIds[$permName],
                    'created_at'    => $this->now,
                    'updated_at'    => $this->now,
                ]);
            }
        }

        // ── 1d. Demo: cashier custom override ─────────────────────────────────
        // Grant cashier user an extra permission (customers.delete)
        // and revoke one default permission (orders.cancel) — to demonstrate overrides
        DB::table('user_permissions')->insert([
            [
                'user_id'       => $cashierId,
                'permission_id' => $permIds['customers.delete'],
                'granted'       => true,
                'created_at'    => $this->now,
                'updated_at'    => $this->now,
            ],
            [
                'user_id'       => $cashierId,
                'permission_id' => $permIds['orders.cancel'],
                'granted'       => false,
                'created_at'    => $this->now,
                'updated_at'    => $this->now,
            ],
        ]);

        // ── 2. Products ───────────────────────────────────────────────────────
        //   [name, brand, weight_kg, selling_price, cost_price, description]
        $productDefs = [
            ['11kg Petron Gasul',  'Petron', 11.0,  850.00,  700.00, 'Standard 11 kg refillable LPG tank — Petron Gasul brand.'],
            ['11kg Solane',        'Solane', 11.0,  830.00,  680.00, 'Standard 11 kg refillable LPG tank — Solane brand.'],
            ['22kg Petron Gasul',  'Petron', 22.0, 1600.00, 1350.00, 'Large 22 kg refillable LPG tank — ideal for commercial kitchens.'],
            ['50kg Industrial LPG','Shell',  50.0, 3500.00, 3000.00, '50 kg industrial LPG cylinder for factories and large establishments.'],
            ['2.7kg Handy Gas',    'Total',   2.7,  380.00,  300.00, 'Portable 2.7 kg mini LPG canister for camping and small appliances.'],
        ];

        $productIds    = [];
        $sellingPrices = [];

        foreach ($productDefs as [$name, $brand, $wkg, $sell, $cost, $desc]) {
            $id = DB::table('products')->insertGetId([
                'name'          => $name,
                'brand'         => $brand,
                'weight_kg'     => $wkg,
                'selling_price' => $sell,
                'cost_price'    => $cost,
                'description'   => $desc,
                'is_active'     => true,
                'created_at'    => $this->now,
                'updated_at'    => $this->now,
            ]);
            $productIds[]    = $id;
            $sellingPrices[] = $sell;

            // Placeholder inventory row (quantity set correctly at the end)
            DB::table('inventories')->insert([
                'product_id'    => $id,
                'quantity'      => 0,
                'reorder_level' => 10,
                'created_at'    => $this->now,
                'updated_at'    => $this->now,
            ]);
        }

        // ── 3. Customers ──────────────────────────────────────────────────────
        //   [name, address, city, barangay, phone, email, type, lat, lng]
        $customerDefs = [
            ['Maria Santos',       '123 Magsaysay St.',          'Imus',           'Tanzang Luma',        '09171111111', 'maria@email.com',    'household',  14.4297,  120.9367],
            ['Juan dela Cruz',     '456 Aguinaldo Hwy',          'Bacoor',         'Molino III',          '09172222222', null,                 'household',  14.4340,  120.9562],
            ['Ana Reyes',          '789 Governor\'s Drive',      'Dasmarinas',     'Zone I Poblacion',    '09173333333', 'ana.reyes@email.com','household',  14.3294,  120.9367],
            ['Pedro Garcia',       '10 Cañacao Rd.',              'Cavite City',    'Caridad',             '09174444444', null,                 'commercial', 14.4791,  120.8980],
            ['Liza Mendoza',       '22 Tejero Blvd.',            'General Trias',  'Pasong Camachile I',  '09175555555', null,                 'household',  14.3833,  120.8833],
            ['Carlos Bautista',    '55 Rosario St.',              'Rosario',        'Kanluran',            '09176666666', 'carlos@biz.com',     'commercial', 14.4167,  120.8500],
            ['Rosa Flores',        '7 Noveleta Rd.',              'Noveleta',       'Poblacion',           '09177777777', null,                 'household',  14.4333,  120.8833],
            ['Jose Ramos',         '88 Tanza Main Rd.',           'Tanza',          'Bagtas',              '09178888888', null,                 'household',  14.3944,  120.8528],
            ['Elena Cruz',         '34 Silang-Tagaytay Rd.',      'Silang',         'Biga I',              '09179999999', null,                 'household',  14.2333,  120.9667],
            ['Miguel Torres',      '66 Imus Blvd.',               'Imus',           'Alapan II-A',         '09180000001', 'miguel@industry.com','industrial', 14.4292,  120.9367],
            ['Carmen Villanueva',  '11 Molino Rd.',               'Bacoor',         'Talaba IV',           '09181111112', null,                 'household',  14.4500,  120.9600],
            ['Roberto Aquino',     '99 Congressional Rd.',        'Dasmarinas',     'Salawag',             '09182222223', 'rob@aq.com',         'commercial', 14.3167,  120.9400],
            ['Felicia Gomez',      '44 Flor St.',                 'General Trias',  'Buenavista I',        '09183333334', null,                 'household',  14.3833,  120.8750],
            ['Antonio Espiritu',   '15 San Roque St.',            'Cavite City',    'Pio del Pilar',       '09184444445', 'antonio@biz.com',    'commercial', 14.4833,  120.9000],
            ['Marilyn Castillo',   '77 Ligtong Rd.',              'Rosario',        'Ligtong I',           '09185555556', null,                 'household',  14.4167,  120.8583],
        ];

        $customerIds = [];
        foreach ($customerDefs as [$name, $addr, $city, $bgay, $phone, $email, $type, $lat, $lng]) {
            $customerIds[] = DB::table('customers')->insertGetId([
                'name'          => $name,
                'address'       => $addr,
                'city'          => $city,
                'barangay'      => $bgay,
                'phone'         => $phone,
                'email'         => $email,
                'customer_type' => $type,
                'latitude'      => $lat,
                'longitude'     => $lng,
                'created_at'    => $this->now,
                'updated_at'    => $this->now,
            ]);
        }

        // ── 4. Orders ─────────────────────────────────────────────────────────
        // Format per spec row:
        //   [status, days_ago, cust_idx, txn_type, pay_method, pay_status, rider_idx|null,
        //    [[prod_idx, qty], ...], del_status|null]
        //
        // del_status only matters for out_for_delivery rows; delivered rows are always 'delivered'.
        // Status flow: pending → confirmed → preparing → out_for_delivery → delivered | cancelled
        // Stock deducted on confirm; invoice created on confirm.
        $specs = [
            // ── 30 Delivered ─────────────────────────────────────────────────
            ['delivered', 60, 0,  'refill',       'cash',          'paid',    0, [[0, 2]],       null],
            ['delivered', 58, 1,  'refill',       'gcash',         'paid',    1, [[1, 1]],       null],
            ['delivered', 56, 2,  'new_purchase', 'cash',          'paid',    0, [[0, 1], [4,2]],null],
            ['delivered', 54, 3,  'refill',       'maya',          'paid',    2, [[2, 1]],       null],
            ['delivered', 52, 4,  'refill',       'cash',          'paid',    0, [[0, 3]],       null],
            ['delivered', 50, 5,  'new_purchase', 'bank_transfer', 'paid',    1, [[3, 1]],       null],
            ['delivered', 48, 6,  'refill',       'cash',          'paid',    2, [[1, 2]],       null],
            ['delivered', 46, 7,  'refill',       'gcash',         'paid',    0, [[0, 1]],       null],
            ['delivered', 44, 8,  'refill',       'cash',          'paid',    1, [[4, 3]],       null],
            ['delivered', 42, 9,  'new_purchase', 'maya',          'paid',    2, [[0, 2], [1,1]],null],
            ['delivered', 40, 10, 'refill',       'cash',          'paid',    0, [[2, 1]],       null],
            ['delivered', 38, 11, 'refill',       'gcash',         'paid',    1, [[0, 1]],       null],
            ['delivered', 36, 12, 'refill',       'cash',          'paid',    2, [[1, 1], [4,2]],null],
            ['delivered', 34, 13, 'new_purchase', 'bank_transfer', 'paid',    0, [[3, 1]],       null],
            ['delivered', 32, 14, 'refill',       'cash',          'paid',    1, [[0, 2]],       null],
            ['delivered', 30, 0,  'refill',       'gcash',         'paid',    2, [[0, 1]],       null],
            ['delivered', 28, 2,  'new_purchase', 'cash',          'paid',    0, [[1, 2]],       null],
            ['delivered', 26, 4,  'refill',       'maya',          'paid',    1, [[2, 1]],       null],
            ['delivered', 24, 6,  'refill',       'cash',          'paid',    2, [[0, 1]],       null],
            ['delivered', 22, 8,  'refill',       'gcash',         'paid',    0, [[1, 1]],       null],
            ['delivered', 20, 10, 'new_purchase', 'cash',          'paid',    1, [[4, 4]],       null],
            ['delivered', 18, 1,  'refill',       'bank_transfer', 'paid',    2, [[0, 2]],       null],
            ['delivered', 16, 3,  'refill',       'cash',          'paid',    0, [[1, 1]],       null],
            ['delivered', 14, 5,  'new_purchase', 'gcash',         'paid',    1, [[2, 1], [4,2]],null],
            ['delivered', 12, 7,  'refill',       'cash',          'paid',    2, [[0, 1]],       null],
            ['delivered', 10, 9,  'refill',       'maya',          'paid',    0, [[1, 2]],       null],
            ['delivered',  8, 11, 'new_purchase', 'cash',          'paid',    1, [[3, 1]],       null],
            ['delivered',  6, 13, 'refill',       'gcash',         'paid',    2, [[0, 1]],       null],
            ['delivered',  4, 0,  'refill',       'cash',          'paid',    0, [[1, 1]],       null],
            ['delivered',  2, 2,  'new_purchase', 'bank_transfer', 'partial', 1, [[2, 1], [1,1]],null],

            // ── 5 Out for Delivery (active) ───────────────────────────────────
            ['out_for_delivery', 5, 4,  'refill',       'cash',  'unpaid', 0, [[0, 2]],  'in_transit'],
            ['out_for_delivery', 4, 6,  'refill',       'gcash', 'unpaid', 1, [[1, 1]],  'picked_up'],
            ['out_for_delivery', 3, 8,  'new_purchase', 'cash',  'unpaid', 2, [[4, 3]],  'in_transit'],
            ['out_for_delivery', 2, 10, 'refill',       'maya',  'unpaid', 0, [[0, 1]],  'picked_up'],
            ['out_for_delivery', 1, 12, 'refill',       'cash',  'unpaid', 1, [[2, 1]],  'assigned'],

            // ── 2 Preparing (confirmed, stock deducted, no delivery yet) ──────
            ['preparing', 2, 1, 'refill',       'gcash', 'unpaid', null, [[0, 1]], null],
            ['preparing', 1, 3, 'new_purchase', 'cash',  'unpaid', null, [[1, 2]], null],

            // ── 3 Confirmed (invoice exists, stock deducted, no delivery) ─────
            ['confirmed', 1, 5,  'refill',       'cash',  'unpaid', null, [[0, 1]], null],
            ['confirmed', 0, 7,  'refill',       'gcash', 'unpaid', null, [[1, 1]], null],
            ['confirmed', 0, 14, 'new_purchase', 'cash',  'unpaid', null, [[4, 2]], null],

            // ── 5 Pending (no stock deducted, no invoice) ─────────────────────
            ['pending', 0, 9,  'refill',       'cash',          'unpaid', null, [[0, 1]], null],
            ['pending', 0, 11, 'refill',       'gcash',         'unpaid', null, [[1, 1]], null],
            ['pending', 0, 13, 'new_purchase', 'cash',          'unpaid', null, [[2, 1]], null],
            ['pending', 0, 12, 'refill',       'maya',          'unpaid', null, [[0, 2]], null],
            ['pending', 0, 14, 'refill',       'bank_transfer', 'unpaid', null, [[4, 3]], null],

            // ── 5 Cancelled (never confirmed — no invoice, no stock deducted) ──
            ['cancelled', 55, 6,  'refill',       'cash',  'unpaid', null, [[1, 1]], null],
            ['cancelled', 45, 8,  'new_purchase', 'cash',  'unpaid', null, [[0, 1]], null],
            ['cancelled', 35, 10, 'refill',       'gcash', 'unpaid', null, [[2, 1]], null],
            ['cancelled', 25, 12, 'refill',       'cash',  'unpaid', null, [[1, 2]], null],
            ['cancelled', 15, 14, 'new_purchase', 'maya',  'unpaid', null, [[4, 2]], null],
        ];

        foreach ($specs as $spec) {
            [$status, $daysAgo, $custIdx, $txnType, $payMethod, $payStatus, $riderIdx, $items, $delStatus] = $spec;

            $this->orderSeq++;
            $orderDate = $daysAgo > 0
                ? $this->now->copy()->subDays($daysAgo)->setTime(8 + ($this->orderSeq % 10), ($this->orderSeq * 7) % 60)
                : $this->now->copy()->subHours(($this->orderSeq % 8) + 1);

            $year        = $orderDate->format('Y');
            $orderNumber = 'ORD-' . $year . '-' . str_pad($this->orderSeq, 5, '0', STR_PAD_LEFT);

            // Total amount
            $total = 0;
            foreach ($items as [$pIdx, $qty]) {
                $total += $sellingPrices[$pIdx] * $qty;
            }

            // Payment amounts
            $paidAmount = 0;
            $paidAt     = null;
            if ($payStatus === 'paid') {
                $paidAmount = $total;
                $paidAt     = $orderDate->copy()->addHours(1);
            } elseif ($payStatus === 'partial') {
                $paidAmount = round($total * 0.5, 2);
                $paidAt     = $orderDate->copy()->addHours(1);
            }

            // Delivered at timestamp
            $deliveredAt = null;
            if ($status === 'delivered') {
                $deliveredAt = $orderDate->copy()->addHours(3 + ($this->orderSeq % 5));
            }

            $updatedAt = $deliveredAt ?? $orderDate;

            $orderId = DB::table('orders')->insertGetId([
                'order_number'     => $orderNumber,
                'customer_id'      => $customerIds[$custIdx],
                'transaction_type' => $txnType,
                'status'           => $status,
                'total_amount'     => $total,
                'payment_method'   => $payMethod,
                'payment_status'   => $payStatus,
                'notes'            => null,
                'ordered_at'       => $orderDate,
                'delivered_at'     => $deliveredAt,
                'created_by'       => $adminId,
                'created_at'       => $orderDate,
                'updated_at'       => $updatedAt,
            ]);

            // Order items
            foreach ($items as [$pIdx, $qty]) {
                DB::table('order_items')->insert([
                    'order_id'   => $orderId,
                    'product_id' => $productIds[$pIdx],
                    'quantity'   => $qty,
                    'unit_price' => $sellingPrices[$pIdx],
                    'subtotal'   => $sellingPrices[$pIdx] * $qty,
                    'created_at' => $orderDate,
                    'updated_at' => $orderDate,
                ]);
            }

            // Confirmed+ gets invoice + stock deduction
            $isConfirmedPlus = in_array($status, ['confirmed', 'preparing', 'out_for_delivery', 'delivered']);

            if ($isConfirmedPlus) {
                $this->invoiceSeq++;
                $invoiceNumber = 'INV-' . $year . '-' . str_pad($this->invoiceSeq, 5, '0', STR_PAD_LEFT);

                $confirmDate = $orderDate->copy()->addMinutes(30);

                DB::table('invoices')->insert([
                    'invoice_number' => $invoiceNumber,
                    'order_id'       => $orderId,
                    'customer_id'    => $customerIds[$custIdx],
                    'total_amount'   => $total,
                    'payment_status' => $payStatus,
                    'paid_amount'    => $paidAmount,
                    'payment_method' => $payMethod,
                    'paid_at'        => $paidAt,
                    'due_date'       => $orderDate->copy()->addDays(7)->toDateString(),
                    'created_at'     => $confirmDate,
                    'updated_at'     => $confirmDate,
                ]);

                // Inventory transactions (type = 'order') per item — stock goes out
                foreach ($items as [$pIdx, $qty]) {
                    $this->consumed[$pIdx] += $qty;

                    DB::table('inventory_transactions')->insert([
                        'product_id' => $productIds[$pIdx],
                        'type'       => 'order',
                        'quantity'   => $qty,
                        'reference'  => $orderNumber,
                        'notes'      => "Stock out for {$orderNumber}",
                        'user_id'    => $adminId,
                        'created_at' => $confirmDate,
                        'updated_at' => $confirmDate,
                    ]);
                }
            }

            // out_for_delivery + delivered → create delivery record
            if (in_array($status, ['out_for_delivery', 'delivered']) && $riderIdx !== null) {
                $assignedAt     = $orderDate->copy()->addHours(1);
                $actualDelStatus = $status === 'delivered' ? 'delivered' : ($delStatus ?? 'assigned');

                DB::table('deliveries')->insert([
                    'order_id'     => $orderId,
                    'rider_id'     => $riderIds[$riderIdx],
                    'status'       => $actualDelStatus,
                    'notes'        => null,
                    'assigned_at'  => $assignedAt,
                    'delivered_at' => $deliveredAt,
                    'created_at'   => $assignedAt,
                    'updated_at'   => $deliveredAt ?? $assignedAt,
                ]);
            }
        }

        // ── 5. Finalize Inventory ─────────────────────────────────────────────
        // Target final stock (what will show on the Inventory page after demo orders)
        $targetStock = [45, 30, 20, 10, 60];

        $openingDate = $this->now->copy()->subDays(90)->setTime(8, 0);

        foreach ($productIds as $i => $productId) {
            $initialStock = $targetStock[$i] + $this->consumed[$i];

            // Opening stock-in transaction (90 days ago)
            DB::table('inventory_transactions')->insert([
                'product_id' => $productId,
                'type'       => 'in',
                'quantity'   => $initialStock,
                'reference'  => 'OPENING',
                'notes'      => 'Opening stock on system launch',
                'user_id'    => $adminId,
                'created_at' => $openingDate,
                'updated_at' => $openingDate,
            ]);
        }

        // Mid-period restocking (30 days ago) — makes transaction history look richer
        $restockDate = $this->now->copy()->subDays(30)->setTime(9, 0);
        $restocks    = [30, 20, 10, 5, 40]; // restock quantities per product
        foreach ($productIds as $i => $productId) {
            DB::table('inventory_transactions')->insert([
                'product_id' => $productId,
                'type'       => 'in',
                'quantity'   => $restocks[$i],
                'reference'  => 'RESTOCK-' . $restockDate->format('Y-m-d'),
                'notes'      => 'Monthly restocking from supplier',
                'user_id'    => $adminId,
                'created_at' => $restockDate,
                'updated_at' => $restockDate,
            ]);

            // Set inventory quantity to target final stock
            DB::table('inventories')
                ->where('product_id', $productId)
                ->update([
                    'quantity'   => $targetStock[$i],
                    'updated_at' => $this->now,
                ]);
        }

        // ── 6. Settings ───────────────────────────────────────────────────────
        $settings = [
            ['company_name',          'LPG Distribution Cavite'],
            ['company_address',       'Blk 5 Lot 12 Kamagong St., Alapan II-A, Imus, Cavite 4103'],
            ['company_phone',         '046-471-2345'],
            ['company_email',         'info@lpgcavite.com'],
            ['default_reorder_level', '10'],
            ['lead_time_days',        '3'],
        ];
        foreach ($settings as [$key, $value]) {
            DB::table('settings')->insert([
                'key'        => $key,
                'value'      => $value,
                'created_at' => $this->now,
                'updated_at' => $this->now,
            ]);
        }

        // ── 7. Archived Demo Records ──────────────────────────────────────────
        // Archived customer (soft-deleted — to demo the "Archived" tab)
        DB::table('customers')->insert([
            'name'          => 'Old Sari-Sari Store',
            'address'       => '5 Barangay Rd.',
            'city'          => 'Tanza',
            'barangay'      => 'Amaya I',
            'phone'         => '09190000001',
            'email'         => null,
            'customer_type' => 'commercial',
            'notes'         => 'Business permanently closed.',
            'created_at'    => $this->now->copy()->subDays(120),
            'updated_at'    => $this->now->copy()->subDays(30),
            'deleted_at'    => $this->now->copy()->subDays(30),
        ]);

        // Archived product (soft-deleted — to demo the "Archived" tab)
        $archivedProductId = DB::table('products')->insertGetId([
            'name'          => '22kg Solane',
            'brand'         => 'Solane',
            'weight_kg'     => 22.0,
            'selling_price' => 1550.00,
            'cost_price'    => 1300.00,
            'description'   => 'Discontinued — replaced by 22kg Petron Gasul.',
            'is_active'     => false,
            'created_at'    => $this->now->copy()->subDays(180),
            'updated_at'    => $this->now->copy()->subDays(45),
            'deleted_at'    => $this->now->copy()->subDays(45),
        ]);
        // Its inventory row (also soft-deleted)
        DB::table('inventories')->insert([
            'product_id'    => $archivedProductId,
            'quantity'      => 0,
            'reorder_level' => 10,
            'created_at'    => $this->now->copy()->subDays(180),
            'updated_at'    => $this->now->copy()->subDays(45),
            'deleted_at'    => $this->now->copy()->subDays(45),
        ]);

        // ── Summary output ────────────────────────────────────────────────────
        $this->command->info('');
        $this->command->info('  Demo data seeded successfully!');
        $this->command->info('  ────────────────────────────────────────────');
        $this->command->info('  Admin:     admin@lpg.com / password123');
        $this->command->info('  Manager:   manager@lpg.com / password123');
        $this->command->info('  Cashier:   cashier@lpg.com / password123');
        $this->command->info('  Warehouse: warehouse@lpg.com / password123');
        $this->command->info('  Rider 1:   rider1@lpg.com / password123');
        $this->command->info('  Rider 2:   rider2@lpg.com / password123');
        $this->command->info('  Rider 3:   rider3@lpg.com / password123');
        $this->command->info('  ────────────────────────────────────────────');
        $this->command->info('  Orders:     ' . $this->orderSeq . ' total (30 delivered, 5 OFD, 2 preparing, 3 confirmed, 5 pending, 5 cancelled)');
        $this->command->info('  Invoices:   ' . $this->invoiceSeq . ' (all confirmed+ orders)');
        $this->command->info('  Customers:  15 active + 1 archived');
        $this->command->info('  Products:   5 active + 1 archived');
        $this->command->info('  Stock:      11kg Petron=' . $targetStock[0] . ', 11kg Solane=' . $targetStock[1] . ', 22kg Petron=' . $targetStock[2] . ', 50kg=' . $targetStock[3] . ', 2.7kg=' . $targetStock[4]);
        $this->command->info('');
    }
}
