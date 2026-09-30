<?php

namespace Database\Seeders;

use App\Models\CustomerLoyalty;
use App\Models\Store;
use App\Models\StoreLoyaltySettings;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Demo loyalty data: Store 1 (Petron Gasul Cavite) runs the program, Store 2 does not.
 * Users are looked up by email so this doesn't depend on insert order. Safe to re-run.
 */
class LoyaltySeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::where('store_name', 'Petron Gasul Cavite')->first() ?? Store::find(1);
        if (! $store) {
            $this->command?->warn('LoyaltySeeder: store 1 not found — run DemoSeeder first.');
            return;
        }

        StoreLoyaltySettings::updateOrCreate(['store_id' => $store->id], [
            'is_enabled'                      => true,
            'regular_threshold'               => 8,
            'loyal_threshold'                 => 15,
            'vip_threshold'                   => 25,
            'new_downpayment_percent'         => 60,
            'regular_downpayment_percent'     => 50,
            'loyal_downpayment_percent'       => 40,
            'vip_downpayment_percent'         => 30,
            'min_trust_score_for_consignment' => 40,
            'inactivity_days'                 => 90,
        ]);

        $customers = [
            // Felicia Gomez — Regular, good trust
            'customer1@lpg.com' => [
                'tier' => 'regular', 'total_orders' => 10, 'total_spent' => 4500.00, 'cancelled_orders' => 1,
                'late_payments' => 0, 'on_time_payments' => 3, 'trust_score' => 72.50,
                'tier_achieved_at' => now()->subDays(30), 'last_order_at' => now()->subDays(5),
            ],
            // Carlos Bautista — New, low trust (cancels a lot) → consignment blocked
            'customer2@lpg.com' => [
                'tier' => 'new', 'total_orders' => 3, 'total_spent' => 1200.00, 'cancelled_orders' => 4,
                'late_payments' => 2, 'on_time_payments' => 1, 'trust_score' => 28.00,
                'tier_achieved_at' => null, 'last_order_at' => now()->subDays(15),
            ],
            // Jose Ramos — Loyal, excellent trust
            'customer3@lpg.com' => [
                'tier' => 'loyal', 'total_orders' => 18, 'total_spent' => 8500.00, 'cancelled_orders' => 0,
                'late_payments' => 1, 'on_time_payments' => 6, 'trust_score' => 88.00,
                'tier_achieved_at' => now()->subDays(14), 'last_order_at' => now()->subDays(2),
            ],
        ];

        foreach ($customers as $email => $data) {
            $user = User::where('email', $email)->first();
            if (! $user) {
                $this->command?->warn("LoyaltySeeder: {$email} not found, skipped.");
                continue;
            }
            $record = CustomerLoyalty::withTrashed()->firstOrNew(['user_id' => $user->id, 'store_id' => $store->id]);
            $record->fill($data);
            $record->deleted_at = null;
            $record->save();
        }

        // Store 2 intentionally has no loyalty program (contrast for the demo)
    }
}
