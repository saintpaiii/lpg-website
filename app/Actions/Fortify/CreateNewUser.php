<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    /**
     * Validate and create a newly registered user (customer role).
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            ...$this->profileRules(),
            'phone'    => ['required', 'string', 'max:20'],
            'address'  => ['required', 'string', 'max:500'],
            'city'     => ['required', 'string', 'max:100'],
            'barangay' => ['nullable', 'string', 'max:100'],
            'password' => $this->passwordRules(),
        ])->validate();

        return DB::transaction(function () use ($input) {
            $user = User::create([
                'name'     => $input['name'],
                'email'    => $input['email'],
                'password' => $input['password'],
                'phone'    => $input['phone'],
                'role'     => 'customer',
                'is_active'=> true,
            ]);

            Customer::create([
                'user_id'       => $user->id,
                'name'          => $input['name'],
                'phone'         => $input['phone'],
                'email'         => $input['email'],
                'address'       => $input['address'],
                'city'          => $input['city'],
                'barangay'      => $input['barangay'] ?? '',
                'customer_type' => 'household',
            ]);

            return $user;
        });
    }
}
