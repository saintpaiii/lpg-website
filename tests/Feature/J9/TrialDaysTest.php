<?php

use App\Models\SubscriptionPayment;
use App\Services\SubscriptionService;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('a new approval → a free trial of plans.trial_days (14) days; the trial has every Premium feature EXCEPT branches', function () {
    expect(config('plans.trial_days'))->toBe(14);
    $store = $this->makeStore(['subscription_plan' => 'none', 'subscription_expires_at' => null, 'trial_used_at' => null]);

    expect(SubscriptionService::startTrial($store))->toBeTrue();
    $store->refresh();
    expect($store->subscription_plan)->toBe('trial')
        ->and((int) round(now()->diffInDays($store->subscription_expires_at)))->toBe(14)
        ->and(SubscriptionPayment::where('store_id', $store->id)->value('notes'))->toBe('Free 14-day Premium trial')
        ->and(SubscriptionService::hasFeature($store, 'dss'))->toBeTrue()
        ->and(SubscriptionService::hasFeature($store, 'branches'))->toBeFalse()
        ->and(\App\Models\Notification::where('user_id', $store->user_id)->value('message'))->toStartWith('Your free 14-day Premium trial has started.');

    $store->forceFill(['subscription_plan' => 'premium'])->save();
    expect(SubscriptionService::hasFeature($store, 'branches'))->toBeTrue();
});

test('the texts follow the config value (no hard-coded 30-day trial)', function () {
    config(['plans.trial_days' => 7]);
    $store = $this->makeStore(['subscription_plan' => 'none', 'subscription_expires_at' => null, 'trial_used_at' => null]);
    SubscriptionService::startTrial($store);

    expect((int) round(now()->diffInDays($store->fresh()->subscription_expires_at)))->toBe(7)
        ->and(SubscriptionPayment::where('store_id', $store->id)->value('notes'))->toBe('Free 7-day Premium trial')
        ->and(SubscriptionService::publicPlans()['trial_days'])->toBe(7);
    $this->get('/')->assertInertia(fn ($p) => $p->where('trial_days', 7));

    // No "30-day" trial wording left in the pages / services
    foreach (['resources/js/pages/auth/seller-register.tsx', 'resources/js/pages/customer/become-seller.tsx', 'resources/js/pages/landing.tsx',
        'app/Services/SubscriptionService.php', 'resources/legal/seller_terms.md'] as $f) {
        expect(file_get_contents(base_path($f)))->not->toMatch('/30-day (Premium )?trial/');
    }
});
