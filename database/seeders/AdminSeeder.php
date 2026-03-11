<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        // Original admin account (preserved)
        User::updateOrCreate(
            ['email' => 'delacruz.saintjoseph@ncst.edu.ph'],
            [
                'name'              => 'Admin',
                'password'          => Hash::make('Ncst@1234'),
                'role'              => 'admin',
                'is_admin'          => true,
                'is_active'         => true,
                'email_verified_at' => now(),
            ]
        );

        // Seeder admin account
        User::updateOrCreate(
            ['email' => 'admin@lpg.com'],
            [
                'name'              => 'LPG Admin',
                'password'          => Hash::make('password123'),
                'role'              => 'admin',
                'is_admin'          => true,
                'is_active'         => true,
                'email_verified_at' => now(),
            ]
        );
    }
}
