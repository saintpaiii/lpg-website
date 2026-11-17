<?php

test('registration screen can be rendered', function () {
    $response = $this->get(route('register'));

    $response->assertOk();
});

test('new users can register', function () {
    // The customer registration form (CreateNewUser): full name, mobile, address, strong password, terms
    $response = $this->post(route('register.store'), [
        'first_name' => 'Test',
        'last_name' => 'User',
        'email' => 'test@example.com',
        'phone' => '09171234567',
        'address' => '1 Rizal St.',
        'city' => 'Imus',
        'barangay' => 'Alapan I-A',
        'password' => 'Password@123',
        'password_confirmation' => 'Password@123',
        'terms' => '1',
    ]);

    $response->assertSessionHasNoErrors();
    $this->assertAuthenticated();
    $response->assertRedirect();
    expect(\App\Models\User::where('email', 'test@example.com')->value('role'))->toBe('customer');
});