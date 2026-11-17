<?php

uses(Tests\Concerns\BuildsLpgWorld::class);

// This app has no generic "dashboard" route: each role has its own home (customers: /customer/dashboard).
test('guests are redirected to the login page', function () {
    $response = $this->get('/customer/dashboard');
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    [$user] = $this->makeCustomer();
    $this->actingAs($user);

    // The customer home is the product catalog (/customer/dashboard forwards there)
    $this->get('/customer/dashboard')->assertRedirect('/customer/products');
    $this->get('/customer/products')->assertOk();
});