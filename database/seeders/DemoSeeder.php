<?php

namespace Database\Seeders;

use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Clean multi-vendor demo seeder for thesis defense.
 * Run with: php artisan migrate:fresh --seed
 *
 * Accounts created:
 *  - 1 platform_admin  (admin@lpg.com / password)
 *  - 1 platform_staff  (staff@lpg.com / Password@123)
 *  - 2 sellers + staff (seller1, seller2, rider1, cashier1, warehouse1, rider2)
 *  - 5 customers       (customer1–5@lpg.com / Password@123)
 *  - 2 stores (both approved)
 *  - 25 orders spread across both stores (mix of statuses)
 */
class DemoSeeder extends Seeder
{
    private Carbon $now;
    private int $orderSeq   = 0;
    private int $invoiceSeq = 0;

    public function run(): void
    {
        $this->now = Carbon::now();

        // ══════════════════════════════════════════════════════════════════════
        // 1. PLATFORM USERS
        // ══════════════════════════════════════════════════════════════════════
        $adminId = DB::table('users')->insertGetId([
            'name'              => 'Platform Admin',
            'email'             => 'admin@lpg.com',
            'password'          => Hash::make('password'),
            'role'              => 'platform_admin',
            'is_admin'          => true,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(120),
            'updated_at'        => $this->now,
        ]);

        // Platform Staff — uses role='admin' + is_platform_staff=true
        // sub_role stores their position label (Moderator)
        $staffId = DB::table('users')->insertGetId([
            'name'              => 'Antonio Cruz',
            'email'             => 'staff@lpg.com',
            'password'          => Hash::make('Password@123'),
            'role'              => 'admin',
            'sub_role'          => 'Moderator',
            'is_admin'          => false,
            'is_platform_staff' => true,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(90),
            'updated_at'        => $this->now,
        ]);

        // ══════════════════════════════════════════════════════════════════════
        // 2. SELLERS
        // ══════════════════════════════════════════════════════════════════════
        $seller1Id = DB::table('users')->insertGetId([
            'name'              => 'Maria Santos',
            'email'             => 'seller1@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09171000001',
            'role'              => 'seller',
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(90),
            'updated_at'        => $this->now,
        ]);

        $seller2Id = DB::table('users')->insertGetId([
            'name'              => 'Roberto Aquino',
            'email'             => 'seller2@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09171000002',
            'role'              => 'seller',
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(60),
            'updated_at'        => $this->now,
        ]);

        // ══════════════════════════════════════════════════════════════════════
        // 3. STORES
        // ══════════════════════════════════════════════════════════════════════
        $store1Id = DB::table('stores')->insertGetId([
            'user_id'                 => $seller1Id,
            'store_name'              => 'Petron Gasul Cavite',
            'description'             => 'Your trusted LPG distributor in Imus, Cavite. Authorized Petron Gasul dealer since 2015. Fast delivery within Imus, Bacoor, and General Trias.',
            'address'                 => 'Blk 5 Lot 12 Kamagong St., Alapan II-A',
            'city'                    => 'Imus',
            'barangay'                => 'Alapan II-A',
            'province'                => 'Cavite',
            'phone'                   => '046-471-2345',
            'email'                   => 'petrongasulcavite@gmail.com',
            'logo'                    => null,
            'bir_permit'              => 'permits/store1-bir.pdf',
            'business_permit'         => 'permits/store1-business.pdf',
            'delivery_fee'            => 50.00,
            'status'                  => 'approved',
            'subscription_plan'       => 'premium',
            'subscription_expires_at' => $this->now->copy()->addYear(),
            'commission_rate'         => 5.00,
            'is_featured'             => true,
            'approved_at'             => $this->now->copy()->subDays(88),
            'approved_by'             => $adminId,
            'created_at'              => $this->now->copy()->subDays(90),
            'updated_at'              => $this->now,
        ]);

        $store2Id = DB::table('stores')->insertGetId([
            'user_id'                 => $seller2Id,
            'store_name'              => 'Solane Direct Bacoor',
            'description'             => 'Authorized Solane LPG dealer in Bacoor, Cavite. Competitive prices and same-day delivery for Molino, Habay, and nearby barangays.',
            'address'                 => '22 Tejero Blvd., Molino III',
            'city'                    => 'Bacoor',
            'barangay'                => 'Molino III',
            'province'                => 'Cavite',
            'phone'                   => '046-483-5678',
            'email'                   => 'solanedirect.bacoor@gmail.com',
            'logo'                    => null,
            'bir_permit'              => 'permits/store2-bir.pdf',
            'business_permit'         => 'permits/store2-business.pdf',
            'delivery_fee'            => 45.00,
            'status'                  => 'approved',
            'subscription_plan'       => 'free',
            'subscription_expires_at' => null,
            'commission_rate'         => 5.00,
            'is_featured'             => false,
            'approved_at'             => $this->now->copy()->subDays(58),
            'approved_by'             => $adminId,
            'created_at'              => $this->now->copy()->subDays(60),
            'updated_at'              => $this->now,
        ]);

        // Link sellers back to their stores
        DB::table('users')->where('id', $seller1Id)->update(['store_id' => $store1Id]);
        DB::table('users')->where('id', $seller2Id)->update(['store_id' => $store2Id]);

        // ══════════════════════════════════════════════════════════════════════
        // 4. SELLER STAFF
        // ══════════════════════════════════════════════════════════════════════

        // Store 1 staff
        $rider1Id = DB::table('users')->insertGetId([
            'name'              => 'Juan Garcia',
            'email'             => 'rider1@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09201000001',
            'role'              => 'seller_staff',
            'sub_role'          => 'rider',
            'store_id'          => $store1Id,
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(85),
            'updated_at'        => $this->now,
        ]);

        $cashier1Id = DB::table('users')->insertGetId([
            'name'              => 'Ana Reyes',
            'email'             => 'cashier1@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09201000002',
            'role'              => 'seller_staff',
            'sub_role'          => 'cashier',
            'store_id'          => $store1Id,
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(85),
            'updated_at'        => $this->now,
        ]);

        $warehouse1Id = DB::table('users')->insertGetId([
            'name'              => 'Pedro Cruz',
            'email'             => 'warehouse1@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09201000003',
            'role'              => 'seller_staff',
            'sub_role'          => 'warehouse',
            'store_id'          => $store1Id,
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(85),
            'updated_at'        => $this->now,
        ]);

        // Store 2 staff
        $rider2Id = DB::table('users')->insertGetId([
            'name'              => 'Miguel Torres',
            'email'             => 'rider2@lpg.com',
            'password'          => Hash::make('Password@123'),
            'phone'             => '09201000004',
            'role'              => 'seller_staff',
            'sub_role'          => 'rider',
            'store_id'          => $store2Id,
            'is_admin'          => false,
            'is_platform_staff' => false,
            'is_active'         => true,
            'id_verified'       => true,
            'email_verified_at' => $this->now,
            'created_at'        => $this->now->copy()->subDays(55),
            'updated_at'        => $this->now,
        ]);

        // ══════════════════════════════════════════════════════════════════════
        // 5. CUSTOMERS (user account + customer profile)
        // ══════════════════════════════════════════════════════════════════════
        $customerData = [
            // [name, email, phone, address, city, barangay, type, lat, lng]
            ['Felicia Gomez',     'customer1@lpg.com', '09301000001', '44 Flor St.',                    'General Trias', 'Buenavista I',       'household',  14.3833, 120.8750],
            ['Carlos Bautista',   'customer2@lpg.com', '09301000002', '55 Rosario St.',                 'Rosario',       'Kanluran',           'commercial', 14.4167, 120.8500],
            ['Jose Ramos',        'customer3@lpg.com', '09301000003', '88 Tanza Main Rd.',              'Tanza',         'Bagtas',             'household',  14.3944, 120.8528],
            ['Elena Cruz',        'customer4@lpg.com', '09301000004', '34 Silang-Tagaytay Rd.',         'Silang',        'Biga I',             'household',  14.2333, 120.9667],
            ['Carmen Villanueva', 'customer5@lpg.com', '09301000005', '11 Molino Rd.',                  'Bacoor',        'Talaba IV',          'household',  14.4500, 120.9600],
        ];

        $customerUserIds = [];
        $customerIds     = [];

        foreach ($customerData as [$name, $email, $phone, $address, $city, $barangay, $type, $lat, $lng]) {
            $userId = DB::table('users')->insertGetId([
                'name'              => $name,
                'email'             => $email,
                'password'          => Hash::make('Password@123'),
                'phone'             => $phone,
                'role'              => 'customer',
                'is_admin'          => false,
                'is_platform_staff' => false,
                'is_active'         => true,
                'id_verified'       => false,
                'email_verified_at' => $this->now,
                'created_at'        => $this->now->copy()->subDays(30),
                'updated_at'        => $this->now,
            ]);
            $customerUserIds[] = $userId;

            $customerId = DB::table('customers')->insertGetId([
                'user_id'       => $userId,
                'name'          => $name,
                'address'       => $address,
                'city'          => $city,
                'barangay'      => $barangay,
                'phone'         => $phone,
                'email'         => $email,
                'customer_type' => $type,
                'latitude'      => $lat,
                'longitude'     => $lng,
                'created_at'    => $this->now->copy()->subDays(30),
                'updated_at'    => $this->now,
            ]);
            $customerIds[] = $customerId;
        }

        // ══════════════════════════════════════════════════════════════════════
        // 6. PERMISSIONS
        // ══════════════════════════════════════════════════════════════════════
        $permDefs = [
            ['dashboard.view',           'Dashboard',       'View the seller/admin dashboard'],

            ['customers.view',           'Customers',       'View customer list and profiles'],
            ['customers.create',         'Customers',       'Create new customers'],
            ['customers.edit',           'Customers',       'Edit existing customers'],
            ['customers.delete',         'Customers',       'Archive / delete customers'],

            ['products.view',            'Products',        'View products and pricing'],
            ['products.create',          'Products',        'Add new products'],
            ['products.edit',            'Products',        'Edit product details'],
            ['products.delete',          'Products',        'Archive / delete products'],
            ['products.toggle',          'Products',        'Toggle product active status'],

            ['inventory.view',           'Inventory',       'View stock levels and transactions'],
            ['inventory.stock_in',       'Inventory',       'Record stock-in (receive goods)'],
            ['inventory.stock_out',      'Inventory',       'Record manual stock-out'],
            ['inventory.adjust',         'Inventory',       'Adjust reorder levels'],

            ['orders.view',              'Orders',          'View orders list and details'],
            ['orders.create',            'Orders',          'Create new orders'],
            ['orders.edit',              'Orders',          'Edit order details / payment'],
            ['orders.confirm',           'Orders',          'Confirm / advance order status'],
            ['orders.cancel',            'Orders',          'Cancel orders'],
            ['orders.delete',            'Orders',          'Archive / delete orders'],

            ['deliveries.view',          'Deliveries',      'View delivery list and details'],
            ['deliveries.assign',        'Deliveries',      'Assign riders to orders'],
            ['deliveries.update_status', 'Deliveries',      'Update delivery status'],
            ['deliveries.delete',        'Deliveries',      'Archive / delete deliveries'],

            ['invoices.view',            'Invoices',        'View invoices'],
            ['invoices.payment',         'Invoices',        'Record invoice payments'],
            ['invoices.delete',          'Invoices',        'Archive / delete invoices'],

            ['reports.view',             'Reports',         'View reports and analytics'],
            ['reports.export',           'Reports',         'Export reports to PDF / CSV'],

            ['dss.view',                 'DSS',             'View DSS insights and forecasts'],
            ['dss.manage',               'DSS',             'Run and configure DSS models'],

            ['stores.view',              'Stores',          'View store list and store details'],
            ['stores.manage',            'Stores',          'Approve, reject, suspend stores'],

            ['verifications.view',       'Verifications',   'View ID verification requests'],
            ['verifications.manage',     'Verifications',   'Approve or reject verification requests'],

            ['users.view',               'User Management', 'View platform users and profiles'],
            ['users.create',             'User Management', 'Create new staff accounts'],
            ['users.edit',               'User Management', 'Edit user account details'],
            ['users.delete',             'User Management', 'Archive / delete users'],
            ['users.permissions',        'User Management', 'Manage per-user permission overrides'],

            ['settings.view',            'Settings',        'View system settings'],
            ['settings.edit',            'Settings',        'Edit system settings'],
        ];

        $permIds = [];
        foreach ($permDefs as [$name, $group, $desc]) {
            $permIds[$name] = DB::table('permissions')->insertGetId([
                'name'        => $name,
                'group'       => $group,
                'description' => $desc,
                'created_at'  => $this->now,
                'updated_at'  => $this->now,
            ]);
        }

        $allPerms = array_keys($permIds);

        // Seller owner — everything except platform-level permissions
        $platformOnlyPerms = [
            'stores.view', 'stores.manage',
            'verifications.view', 'verifications.manage',
            'users.view', 'users.create', 'users.edit', 'users.delete', 'users.permissions',
            'settings.view', 'settings.edit',
        ];
        $sellerPerms = array_values(array_diff($allPerms, $platformOnlyPerms));

        // Seller_staff by sub_role
        $cashierPerms = [
            'dashboard.view',
            'customers.view', 'customers.create', 'customers.edit',
            'products.view',
            'orders.view', 'orders.create', 'orders.edit', 'orders.confirm', 'orders.cancel',
            'invoices.view', 'invoices.payment',
        ];
        $warehousePerms = [
            'dashboard.view',
            'products.view',
            'inventory.view', 'inventory.stock_in', 'inventory.stock_out', 'inventory.adjust',
        ];
        $riderPerms = [
            'deliveries.view', 'deliveries.update_status',
            'orders.view', 'customers.view',
        ];
        $customerPerms = ['products.view', 'orders.view'];

        $rolePermMap = [
            'platform_admin' => $allPerms,
            'admin'          => $allPerms,
            'seller'         => $sellerPerms,
            'cashier'        => $cashierPerms,
            'warehouse'      => $warehousePerms,
            'rider'          => $riderPerms,
            'customer'       => $customerPerms,
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

        // ══════════════════════════════════════════════════════════════════════
        // 7. STORE 1 PRODUCTS (5 products — Petron Gasul Cavite)
        // ══════════════════════════════════════════════════════════════════════
        // [name, brand, weight_kg, weight, sell, cost, refill, purchase, desc]
        $store1ProductDefs = [
            ['11kg Petron Gasul',   'Petron',  11.0, '11kg',   850.00,  700.00,  750.00,  950.00,  'Standard 11 kg refillable LPG tank — Petron Gasul brand.'],
            ['22kg Petron Gasul',   'Petron',  22.0, '22kg',  1600.00, 1350.00, 1400.00, 1800.00,  'Large 22 kg refillable LPG tank — ideal for commercial kitchens.'],
            ['11kg Solane',         'Solane',  11.0, '11kg',   830.00,  680.00,  730.00,  930.00,  'Standard 11 kg refillable LPG tank — Solane brand.'],
            ['2.7kg Handy Gas',     'Total',    2.7, '2.7kg',  380.00,  300.00,  320.00,  450.00,  'Portable 2.7 kg mini LPG canister for camping and small appliances.'],
            ['50kg Industrial LPG', 'Shell',   50.0, '50kg',  3500.00, 3000.00, 3200.00, 4200.00,  '50 kg industrial LPG cylinder for factories and large establishments.'],
        ];

        $s1ProductIds  = [];
        $s1SellPrices  = [];
        foreach ($store1ProductDefs as [$name, $brand, $wkg, $wstr, $sell, $cost, $refill, $purchase, $desc]) {
            $id = DB::table('products')->insertGetId([
                'store_id'       => $store1Id,
                'name'           => $name,
                'brand'          => $brand,
                'weight_kg'      => $wkg,
                'weight'         => $wstr,
                'selling_price'  => $sell,
                'cost_price'     => $cost,
                'refill_price'   => $refill,
                'purchase_price' => $purchase,
                'description'    => $desc,
                'image'          => null,
                'is_active'      => true,
                'created_at'     => $this->now->copy()->subDays(88),
                'updated_at'     => $this->now,
            ]);
            $s1ProductIds[] = $id;
            $s1SellPrices[] = $sell;

            DB::table('inventories')->insert([
                'product_id'    => $id,
                'quantity'      => 0, // set after orders
                'reorder_level' => 10,
                'created_at'    => $this->now->copy()->subDays(88),
                'updated_at'    => $this->now,
            ]);
        }

        // ══════════════════════════════════════════════════════════════════════
        // 8. STORE 2 PRODUCTS (3 products — Solane Direct Bacoor)
        // ══════════════════════════════════════════════════════════════════════
        $store2ProductDefs = [
            ['11kg Solane',       'Solane', 11.0, '11kg',   820.00, 670.00,  720.00,  920.00,  'Standard 11 kg Solane LPG cylinder. Fast delivery within Bacoor.'],
            ['22kg Solane',       'Solane', 22.0, '22kg',  1550.00,1280.00, 1350.00, 1750.00,  '22 kg Solane LPG tank — great for commercial kitchens.'],
            ['2.7kg Solane Handy','Solane',  2.7, '2.7kg',  370.00, 290.00,  310.00,  440.00,  'Portable 2.7 kg Solane mini LPG for camping and small stoves.'],
        ];

        $s2ProductIds  = [];
        $s2SellPrices  = [];
        foreach ($store2ProductDefs as [$name, $brand, $wkg, $wstr, $sell, $cost, $refill, $purchase, $desc]) {
            $id = DB::table('products')->insertGetId([
                'store_id'       => $store2Id,
                'name'           => $name,
                'brand'          => $brand,
                'weight_kg'      => $wkg,
                'weight'         => $wstr,
                'selling_price'  => $sell,
                'cost_price'     => $cost,
                'refill_price'   => $refill,
                'purchase_price' => $purchase,
                'description'    => $desc,
                'image'          => null,
                'is_active'      => true,
                'created_at'     => $this->now->copy()->subDays(58),
                'updated_at'     => $this->now,
            ]);
            $s2ProductIds[] = $id;
            $s2SellPrices[] = $sell;

            DB::table('inventories')->insert([
                'product_id'    => $id,
                'quantity'      => 0, // set after orders
                'reorder_level' => 10,
                'created_at'    => $this->now->copy()->subDays(58),
                'updated_at'    => $this->now,
            ]);
        }

        // ══════════════════════════════════════════════════════════════════════
        // 9. ORDERS
        // Format per entry:
        // [status, days_ago, cust_idx, txn_type, pay_method, pay_status,
        //  rider_id|null, [[prod_idx, qty], ...], del_status|null]
        //
        // Store 1: 15 orders | Store 2: 10 orders
        // ══════════════════════════════════════════════════════════════════════

        // Store 1 order specs (product indices into $s1ProductIds / $s1SellPrices)
        // p0=11kg Petron Gasul(850), p1=22kg Petron(1600), p2=11kg Solane(830),
        // p3=2.7kg Handy(380),       p4=50kg Industrial(3500)
        $store1Specs = [
            // [status, days_ago, cust_idx, txn_type, pay_method, pay_status, rider_id, items, del_status]
            ['delivered',        30, 0, 'refill',       'cash',          'paid',   $rider1Id, [[0,2]],       null],
            ['delivered',        25, 1, 'new_purchase', 'gcash',         'paid',   $rider1Id, [[1,1]],       null],
            ['delivered',        20, 2, 'refill',       'cash',          'paid',   $rider1Id, [[0,1],[3,2]], null],
            ['delivered',        15, 3, 'refill',       'maya',          'paid',   $rider1Id, [[2,1]],       null],
            ['delivered',        10, 4, 'refill',       'cash',          'paid',   $rider1Id, [[0,3]],       null],
            ['delivered',         7, 0, 'new_purchase', 'bank_transfer', 'paid',   $rider1Id, [[4,1]],       null],
            ['out_for_delivery',  3, 1, 'refill',       'cash',          'unpaid', $rider1Id, [[0,2]],       'in_transit'],
            ['out_for_delivery',  2, 2, 'new_purchase', 'gcash',         'unpaid', $rider1Id, [[1,1]],       'picked_up'],
            ['preparing',         1, 3, 'refill',       'cash',          'unpaid', null,      [[0,1]],       null],
            ['preparing',         1, 4, 'new_purchase', 'maya',          'unpaid', null,      [[3,3]],       null],
            ['confirmed',         0, 0, 'refill',       'cash',          'unpaid', null,      [[2,2]],       null],
            ['confirmed',         0, 1, 'refill',       'gcash',         'unpaid', null,      [[0,1]],       null],
            ['pending',           0, 2, 'new_purchase', 'cash',          'unpaid', null,      [[1,1]],       null],
            ['pending',           0, 3, 'refill',       'cash',          'unpaid', null,      [[0,2]],       null],
            ['cancelled',        12, 4, 'refill',       'cash',          'unpaid', null,      [[0,1]],       null],
        ];

        // Store 2 order specs (product indices into $s2ProductIds / $s2SellPrices)
        // p0=11kg Solane(820), p1=22kg Solane(1550), p2=2.7kg Solane Handy(370)
        $store2Specs = [
            ['delivered',        28, 0, 'refill',       'cash',  'paid',   $rider2Id, [[0,2]],       null],
            ['delivered',        21, 2, 'new_purchase', 'gcash', 'paid',   $rider2Id, [[1,1]],       null],
            ['delivered',        14, 4, 'refill',       'cash',  'paid',   $rider2Id, [[0,1],[2,2]], null],
            ['delivered',         8, 1, 'refill',       'maya',  'paid',   $rider2Id, [[0,2]],       null],
            ['out_for_delivery',  2, 3, 'refill',       'cash',  'unpaid', $rider2Id, [[1,1]],       'assigned'],
            ['out_for_delivery',  1, 0, 'new_purchase', 'gcash', 'unpaid', $rider2Id, [[2,3]],       'in_transit'],
            ['preparing',         0, 2, 'refill',       'cash',  'unpaid', null,      [[0,1]],       null],
            ['confirmed',         0, 4, 'new_purchase', 'maya',  'unpaid', null,      [[1,1]],       null],
            ['pending',           0, 1, 'refill',       'cash',  'unpaid', null,      [[0,2]],       null],
            ['cancelled',        10, 3, 'refill',       'cash',  'unpaid', null,      [[2,1]],       null],
        ];

        // Track consumed units per product for inventory math
        // consumed[$productId] += qty for confirmed+ orders
        $consumed = [];

        $this->seedOrders(
            $store1Specs, $store1Id, $seller1Id,
            $s1ProductIds, $s1SellPrices,
            $customerIds, $customerUserIds,
            0.05, $consumed
        );

        $this->seedOrders(
            $store2Specs, $store2Id, $seller2Id,
            $s2ProductIds, $s2SellPrices,
            $customerIds, $customerUserIds,
            0.05, $consumed
        );

        // ══════════════════════════════════════════════════════════════════════
        // 10. FINALIZE INVENTORY — opening stock + restocks → final stock
        // ══════════════════════════════════════════════════════════════════════

        // Store 1 target final stock
        $s1TargetStock = [45, 20, 30, 60, 10]; // p0..p4
        $openDate      = $this->now->copy()->subDays(88)->setTime(8, 0);

        foreach ($s1ProductIds as $i => $productId) {
            $c       = $consumed[$productId] ?? 0;
            $opening = $s1TargetStock[$i] + $c;

            DB::table('inventory_transactions')->insert([
                'product_id' => $productId,
                'type'       => 'in',
                'quantity'   => $opening,
                'reference'  => 'OPENING',
                'notes'      => 'Opening stock on system launch',
                'user_id'    => $seller1Id,
                'created_at' => $openDate,
                'updated_at' => $openDate,
            ]);

            DB::table('inventories')
                ->where('product_id', $productId)
                ->update(['quantity' => $s1TargetStock[$i], 'updated_at' => $this->now]);
        }

        // Store 2 target final stock
        $s2TargetStock = [35, 15, 25]; // p0..p2
        $openDate2     = $this->now->copy()->subDays(58)->setTime(8, 0);

        foreach ($s2ProductIds as $i => $productId) {
            $c       = $consumed[$productId] ?? 0;
            $opening = $s2TargetStock[$i] + $c;

            DB::table('inventory_transactions')->insert([
                'product_id' => $productId,
                'type'       => 'in',
                'quantity'   => $opening,
                'reference'  => 'OPENING',
                'notes'      => 'Opening stock on system launch',
                'user_id'    => $seller2Id,
                'created_at' => $openDate2,
                'updated_at' => $openDate2,
            ]);

            DB::table('inventories')
                ->where('product_id', $productId)
                ->update(['quantity' => $s2TargetStock[$i], 'updated_at' => $this->now]);
        }

        // ══════════════════════════════════════════════════════════════════════
        // 11. SETTINGS
        // ══════════════════════════════════════════════════════════════════════
        $settings = [
            ['platform_name',         'LPG Marketplace Cavite'],
            ['platform_address',      'Imus, Cavite 4103'],
            ['platform_phone',        '046-471-2345'],
            ['platform_email',        'info@lpgmarketplace.com'],
            ['default_reorder_level', '10'],
            ['lead_time_days',        '3'],
            ['default_commission',    '5.00'],
        ];
        foreach ($settings as [$key, $value]) {
            DB::table('settings')->insert([
                'key'        => $key,
                'value'      => $value,
                'created_at' => $this->now,
                'updated_at' => $this->now,
            ]);
        }

        // ══════════════════════════════════════════════════════════════════════
        // 12. STORE SUBSCRIPTIONS
        // ══════════════════════════════════════════════════════════════════════
        DB::table('store_subscriptions')->insert([
            'store_id'       => $store1Id,
            'plan'           => 'premium',
            'amount'         => 999.00,
            'payment_method' => 'gcash',
            'starts_at'      => $this->now->copy()->subDays(88),
            'expires_at'     => $this->now->copy()->addYear(),
            'status'         => 'active',
            'created_at'     => $this->now->copy()->subDays(88),
            'updated_at'     => $this->now->copy()->subDays(88),
        ]);

        // ══════════════════════════════════════════════════════════════════════
        // 13. VERIFICATION REQUESTS
        // ══════════════════════════════════════════════════════════════════════
        DB::table('verification_requests')->insert([
            [
                'user_id'              => $seller1Id,
                'type'                 => 'seller_application',
                'valid_id_path'        => 'verifications/seller1-id.jpg',
                'bir_permit_path'      => 'verifications/seller1-bir.pdf',
                'business_permit_path' => 'verifications/seller1-bp.pdf',
                'status'               => 'approved',
                'reviewed_by'          => $adminId,
                'reviewed_at'          => $this->now->copy()->subDays(88),
                'rejection_reason'     => null,
                'created_at'           => $this->now->copy()->subDays(90),
                'updated_at'           => $this->now->copy()->subDays(88),
            ],
            [
                'user_id'              => $seller2Id,
                'type'                 => 'seller_application',
                'valid_id_path'        => 'verifications/seller2-id.jpg',
                'bir_permit_path'      => 'verifications/seller2-bir.pdf',
                'business_permit_path' => 'verifications/seller2-bp.pdf',
                'status'               => 'approved',
                'reviewed_by'          => $adminId,
                'reviewed_at'          => $this->now->copy()->subDays(58),
                'rejection_reason'     => null,
                'created_at'           => $this->now->copy()->subDays(60),
                'updated_at'           => $this->now->copy()->subDays(58),
            ],
        ]);

        // ══════════════════════════════════════════════════════════════════════
        // Summary
        // ══════════════════════════════════════════════════════════════════════
        $this->command->info('');
        $this->command->info('  ✓ Demo data seeded successfully!');
        $this->command->info('  ─────────────────────────────────────────────────────────────');
        $this->command->info('  PLATFORM ADMIN');
        $this->command->info('    admin@lpg.com        / password');
        $this->command->info('');
        $this->command->info('  PLATFORM STAFF');
        $this->command->info('    staff@lpg.com        / Password@123  (Moderator)');
        $this->command->info('');
        $this->command->info('  SELLERS');
        $this->command->info('    seller1@lpg.com      / Password@123  — Petron Gasul Cavite [approved, premium]');
        $this->command->info('    seller2@lpg.com      / Password@123  — Solane Direct Bacoor [approved, free]');
        $this->command->info('');
        $this->command->info('  SELLER STAFF  (all: Password@123)');
        $this->command->info('    rider1@lpg.com       — Store 1 Rider     (Juan Garcia)');
        $this->command->info('    cashier1@lpg.com     — Store 1 Cashier   (Ana Reyes)');
        $this->command->info('    warehouse1@lpg.com   — Store 1 Warehouse (Pedro Cruz)');
        $this->command->info('    rider2@lpg.com       — Store 2 Rider     (Miguel Torres)');
        $this->command->info('');
        $this->command->info('  CUSTOMERS  (all: Password@123)');
        $this->command->info('    customer1@lpg.com    — Felicia Gomez');
        $this->command->info('    customer2@lpg.com    — Carlos Bautista');
        $this->command->info('    customer3@lpg.com    — Jose Ramos');
        $this->command->info('    customer4@lpg.com    — Elena Cruz');
        $this->command->info('    customer5@lpg.com    — Carmen Villanueva');
        $this->command->info('  ─────────────────────────────────────────────────────────────');
        $this->command->info('  Orders: 15 (Store 1) + 10 (Store 2) = 25 total');
        $this->command->info('');
    }

    /**
     * Seed a batch of orders for one store, updating $consumed in place.
     *
     * @param  array  $specs          Order specification rows
     * @param  int    $storeId
     * @param  int    $createdBy      Seller user ID (owner)
     * @param  int[]  $productIds     Store product IDs
     * @param  float[] $sellPrices    Parallel selling prices
     * @param  int[]  $customerIds    Customer record IDs (customers table)
     * @param  int[]  $customerUserIds Customer user IDs (users table)
     * @param  float  $commissionRate 0.05 = 5%
     * @param  array  &$consumed      Running consumed-units per product_id
     */
    private function seedOrders(
        array  $specs,
        int    $storeId,
        int    $createdBy,
        array  $productIds,
        array  $sellPrices,
        array  $customerIds,
        array  $customerUserIds,
        float  $commissionRate,
        array  &$consumed
    ): void {
        foreach ($specs as $spec) {
            [$status, $daysAgo, $custIdx, $txnType, $payMethod, $payStatus, $riderId, $items, $delStatus] = $spec;

            $this->orderSeq++;

            $orderDate = $daysAgo > 0
                ? $this->now->copy()->subDays($daysAgo)->setTime(8 + ($this->orderSeq % 10), ($this->orderSeq * 7) % 60)
                : $this->now->copy()->subHours(($this->orderSeq % 6) + 1);

            $year        = $orderDate->format('Y');
            $orderNumber = 'ORD-' . $year . '-' . str_pad($this->orderSeq, 5, '0', STR_PAD_LEFT);

            $total = 0.0;
            foreach ($items as [$pIdx, $qty]) {
                $total += $sellPrices[$pIdx] * $qty;
            }

            $platformFee = round($total * $commissionRate, 2);

            $paidAmount = 0.0;
            $paidAt     = null;
            if ($payStatus === 'paid') {
                $paidAmount = $total;
                $paidAt     = $orderDate->copy()->addHours(1);
            } elseif ($payStatus === 'partial') {
                $paidAmount = round($total * 0.5, 2);
                $paidAt     = $orderDate->copy()->addHours(1);
            }

            $deliveredAt = null;
            if ($status === 'delivered') {
                $deliveredAt = $orderDate->copy()->addHours(3 + ($this->orderSeq % 4));
            }

            $orderId = DB::table('orders')->insertGetId([
                'store_id'         => $storeId,
                'order_number'     => $orderNumber,
                'customer_id'      => $customerIds[$custIdx],
                'transaction_type' => $txnType,
                'status'           => $status,
                'total_amount'     => $total,
                'shipping_fee'     => 0.00,
                'platform_fee'     => $platformFee,
                'payment_method'   => $payMethod,
                'payment_status'   => $payStatus,
                'notes'            => null,
                'ordered_at'       => $orderDate,
                'delivered_at'     => $deliveredAt,
                'created_by'       => $customerUserIds[$custIdx],
                'created_at'       => $orderDate,
                'updated_at'       => $deliveredAt ?? $orderDate,
            ]);

            foreach ($items as [$pIdx, $qty]) {
                DB::table('order_items')->insert([
                    'order_id'   => $orderId,
                    'product_id' => $productIds[$pIdx],
                    'quantity'   => $qty,
                    'unit_price' => $sellPrices[$pIdx],
                    'subtotal'   => $sellPrices[$pIdx] * $qty,
                    'created_at' => $orderDate,
                    'updated_at' => $orderDate,
                ]);
            }

            $isConfirmedPlus = in_array($status, ['confirmed', 'preparing', 'out_for_delivery', 'delivered']);

            if ($isConfirmedPlus) {
                $this->invoiceSeq++;
                $invoiceNumber = 'INV-' . $year . '-' . str_pad($this->invoiceSeq, 5, '0', STR_PAD_LEFT);
                $confirmDate   = $orderDate->copy()->addMinutes(30);

                DB::table('invoices')->insert([
                    'store_id'            => $storeId,
                    'invoice_number'      => $invoiceNumber,
                    'order_id'            => $orderId,
                    'customer_id'         => $customerIds[$custIdx],
                    'total_amount'        => $total,
                    'platform_commission' => $platformFee,
                    'payment_status'      => $payStatus,
                    'paid_amount'         => $paidAmount,
                    'payment_method'      => $payMethod,
                    'paid_at'             => $paidAt,
                    'due_date'            => $orderDate->copy()->addDays(7)->toDateString(),
                    'created_at'          => $confirmDate,
                    'updated_at'          => $confirmDate,
                ]);

                foreach ($items as [$pIdx, $qty]) {
                    $productId = $productIds[$pIdx];
                    $consumed[$productId] = ($consumed[$productId] ?? 0) + $qty;

                    DB::table('inventory_transactions')->insert([
                        'product_id' => $productId,
                        'type'       => 'order',
                        'quantity'   => $qty,
                        'reference'  => $orderNumber,
                        'notes'      => "Stock out for {$orderNumber}",
                        'user_id'    => $createdBy,
                        'created_at' => $confirmDate,
                        'updated_at' => $confirmDate,
                    ]);
                }
            }

            // Delivery record for out_for_delivery+ orders
            if (in_array($status, ['out_for_delivery', 'delivered']) && $riderId !== null) {
                $assignedAt      = $orderDate->copy()->addHours(1);
                $actualDelStatus = $status === 'delivered' ? 'delivered' : ($delStatus ?? 'assigned');

                DB::table('deliveries')->insert([
                    'store_id'     => $storeId,
                    'order_id'     => $orderId,
                    'rider_id'     => $riderId,
                    'status'       => $actualDelStatus,
                    'notes'        => null,
                    'assigned_at'  => $assignedAt,
                    'delivered_at' => $deliveredAt,
                    'created_at'   => $assignedAt,
                    'updated_at'   => $deliveredAt ?? $assignedAt,
                ]);
            }
        }
    }
}
