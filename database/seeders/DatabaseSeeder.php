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
    }
}
