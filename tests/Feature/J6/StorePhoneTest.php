<?php

use App\Rules\PhPhone;
use App\Models\User;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('store phones accept mobiles and landlines', function (string $phone) {
    expect(PhPhone::valid($phone))->toBeTrue();
})->with(['046-483-5678', '(046) 483-5678', '(02) 8123-4567', '02-8123-4567', '09171234567', '+639171234567', '+63 917 123 4567']);

test('bad store phones are rejected', function (string $phone) {
    expect(PhPhone::valid($phone))->toBeFalse();
})->with(['12345', '0917123456', '0123456789', 'abc', '']);

test('a landline is rejected for a personal (mobile-only) phone', function () {
    expect(PhPhone::valid('046-483-5678', false))->toBeFalse()
        ->and(PhPhone::valid('09171234567', false))->toBeTrue();
});

test('settings save works for a store with a landline; a bad number is an error', function () {
    $store = $this->makeStore(['phone' => '046-483-5678']);
    $owner = User::find($store->user_id);
    $payload = [
        'store_name' => $store->store_name, 'address' => $store->address, 'city' => 'Imus', 'barangay' => 'Alapan I-A', 'province' => 'Cavite',
        'phone' => '046-483-5678', 'latitude' => 14.41, 'longitude' => 120.94, 'allow_half_payment' => '1',
    ];

    $this->actingAs($owner)->post('/seller/settings', $payload)->assertStatus(302)->assertSessionHasNoErrors();
    expect($store->fresh()->phone)->toBe('046-483-5678')
        ->and($store->fresh()->allow_half_payment)->toBeTrue();

    $this->actingAs($owner)->post('/seller/settings', ['phone' => '12345'] + $payload)->assertSessionHasErrors('phone');
});
