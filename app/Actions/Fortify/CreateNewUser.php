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
     * Triggers email verification via MustVerifyEmail.
     *
     * @param  array<string, mixed>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            'first_name'  => ['required', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name'   => ['required', 'string', 'max:255'],
            'email'       => $this->emailRules(),
            'phone'       => ['required', 'string', 'regex:/^09\d{9}$/'],
            'address'     => ['required', 'string', 'max:500'],
            'city'        => ['required', 'string', 'max:100'],
            'barangay'    => ['nullable', 'string', 'max:100'],
            'password'    => $this->passwordRules(),
        ])->validate();

        return DB::transaction(function () use ($input) {
            $fullName = trim($input['first_name'] . ' ' . ($input['middle_name'] ? $input['middle_name'] . ' ' : '') . $input['last_name']);

            $user = User::create([
                'name'        => $fullName,
                'first_name'  => $input['first_name'],
                'middle_name' => $input['middle_name'] ?? null,
                'last_name'   => $input['last_name'],
                'email'       => $input['email'],
                'password'    => $input['password'],
                'phone'       => $input['phone'],
                'role'        => 'customer',
                'is_active'   => true,
            ]);

            Customer::create([
                'user_id'       => $user->id,
                'name'          => $fullName,
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
