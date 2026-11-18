<?php

use App\Models\Notification;

uses(Tests\Concerns\BuildsLpgWorld::class);

test('expiry notices at 90 / 30 / 0 days, each only once', function () {
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11, 750, 950, 0);
    $batch = $this->makeBatch($p, 6, now()->addDays(80)->toDateString(), ['batch_code' => 'B-TEST-1']);
    $count = fn () => Notification::where('user_id', $store->user_id)->where('type', 'inventory')->count();

    $this->artisan('cylinders:check-expiry')->assertSuccessful();
    expect($count())->toBe(1)
        ->and(Notification::where('user_id', $store->user_id)->latest('id')->value('title'))->toBe("Cylinders expiring in 80 day(s): {$p->name}");
    $this->artisan('cylinders:check-expiry');
    expect($count())->toBe(1);

    $batch->update(['requalification_due_on' => now()->addDays(25)->toDateString()]);
    $this->artisan('cylinders:check-expiry');
    $this->artisan('cylinders:check-expiry');
    expect($count())->toBe(2);

    $batch->update(['requalification_due_on' => now()->subDay()->toDateString()]);
    $this->artisan('cylinders:check-expiry');
    $this->artisan('cylinders:check-expiry');
    expect($count())->toBe(3)
        ->and(Notification::where('user_id', $store->user_id)->latest('id')->value('title'))->toBe("Cylinders expired: {$p->name}")
        ->and($batch->fresh()->expiry_notices)->toEqual([90, 30, 0]);
});

test('a batch first seen at 20 days gets ONE notice (30), not a catch-up 90 too', function () {
    $store = $this->makeStore();
    $p = $this->makeProduct($store, 11, 750, 950, 0);
    $batch = $this->makeBatch($p, 2, now()->addDays(20)->toDateString());

    $this->artisan('cylinders:check-expiry');
    expect(Notification::where('user_id', $store->user_id)->where('type', 'inventory')->count())->toBe(1)
        ->and($batch->fresh()->expiry_notices)->toEqual([90, 30]);
});
