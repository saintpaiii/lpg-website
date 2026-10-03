<?php

namespace Database\Seeders;

use App\Http\Controllers\CustomerPortal\AddressController;
use App\Models\Customer;
use Illuminate\Database\Seeder;

/**
 * Gives every customer account without saved addresses a default "Home" address built from
 * their profile (pinned from barangay_coordinates). Safe to re-run: users who already have
 * addresses (even deleted ones) are skipped.
 */
class CustomerAddressSeeder extends Seeder
{
    public function run(): void
    {
        Customer::whereNotNull('user_id')->whereNotNull('city')->orderBy('id')
            ->each(fn (Customer $c) => AddressController::ensureDefaultFromProfile($c->user_id, $c));
    }
}
