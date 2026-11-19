<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DemoSeeder::class,
            LegalDocumentSeeder::class,     // Terms & Policies version 1 (skips types that already exist)
            LoyaltySeeder::class,
            BarangayCoordinateSeeder::class,
            CustomerAddressSeeder::class,   // after barangay coordinates (used to pin the Home address)
            StoreQuickReplySeeder::class,   // default chat quick replies
            BranchDemoSeeder::class,        // J9: seller1 on paid Premium + "Imus Branch" (Branch Manager, rider, orders)
        ]);

        // J8: 2 years of GENERATED demo sales history per demo store (sales_history only — no orders / invoices),
        // so the Seller DSS "Seasonal" tab has a meaningful chart. Seeding only runs on local / demo databases.
        foreach (\App\Models\Store::mainStores()->get() as $store) {   // J9: not branches (a new outlet has no 2-year history)
            $n = \App\Services\SalesHistoryDemoService::generate($store, 2);
            $this->command?->info("Demo sales history for {$store->store_name}: {$n} day-rows");
        }
    }
}
