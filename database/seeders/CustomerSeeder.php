<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            [
                'name'          => 'Maria Santos',
                'address'       => '123 Rizal Street',
                'city'          => 'Dasmariñas',
                'barangay'      => 'Paliparan I',
                'phone'         => '09171112222',
                'email'         => 'maria.santos@email.com',
                'customer_type' => 'household',
                'latitude'      => 14.3294,
                'longitude'     => 120.9367,
            ],
            [
                'name'          => 'Jose Reyes',
                'address'       => '45 Aguinaldo Highway',
                'city'          => 'Imus',
                'barangay'      => 'Alapan I-A',
                'phone'         => '09282223333',
                'email'         => null,
                'customer_type' => 'household',
                'latitude'      => 14.4297,
                'longitude'     => 120.9367,
            ],
            [
                'name'          => 'Carinderia ni Aling Nena',
                'address'       => '78 Emilio Aguinaldo Highway',
                'city'          => 'Bacoor',
                'barangay'      => 'Habay I',
                'phone'         => '09393334444',
                'email'         => 'alingnena@business.com',
                'customer_type' => 'commercial',
                'latitude'      => 14.4624,
                'longitude'     => 120.9344,
            ],
            [
                'name'          => 'Cavite Industrial Corp',
                'address'       => 'Lot 5 CEPZ Industrial Road',
                'city'          => 'Rosario',
                'barangay'      => 'Tejero',
                'phone'         => '09174445555',
                'email'         => 'operations@caviteindustrial.com',
                'customer_type' => 'industrial',
                'latitude'      => 14.4158,
                'longitude'     => 120.8510,
            ],
            [
                'name'          => 'Ana Garcia',
                'address'       => '22 Gen. Trias Drive',
                'city'          => 'General Trias',
                'barangay'      => 'Buenavista I',
                'phone'         => '09285556666',
                'email'         => null,
                'customer_type' => 'household',
                'latitude'      => 14.3856,
                'longitude'     => 120.8820,
            ],
        ];

        foreach ($customers as $customer) {
            Customer::updateOrCreate(
                ['phone' => $customer['phone']],
                $customer
            );
        }
    }
}
