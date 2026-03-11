<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class RiderSeeder extends Seeder
{
    public function run(): void
    {
        $riders = [
            ['name' => 'Juan Dela Cruz',  'email' => 'rider1@lpg.com', 'phone' => '09171234567'],
            ['name' => 'Pedro Santos',    'email' => 'rider2@lpg.com', 'phone' => '09281234567'],
            ['name' => 'Mario Reyes',     'email' => 'rider3@lpg.com', 'phone' => '09391234567'],
        ];

        foreach ($riders as $rider) {
            User::updateOrCreate(
                ['email' => $rider['email']],
                [
                    'name'              => $rider['name'],
                    'phone'             => $rider['phone'],
                    'password'          => Hash::make('password123'),
                    'role'              => 'rider',
                    'is_admin'          => false,
                    'is_active'         => true,
                    'email_verified_at' => now(),
                ]
            );
        }
    }
}
