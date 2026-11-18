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
        ]);

        // J8: 2 years of GENERATED demo sales history per demo store (sales_history only — no orders / invoices),
        // so the Seller DSS "Seasonal" tab has a meaningful chart. Seeding only runs on local / demo databases.
        foreach (\App\Models\Store::all() as $store) {
            $n = \App\Services\SalesHistoryDemoService::generate($store, 2);
            $this->command?->info("Demo sales history for {$store->store_name}: {$n} day-rows");
        }
    }
}
