<?php

use App\Models\SalesHistory;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

test('the full DatabaseSeeder runs on lpg_test (a broken seeder fails the suite) and creates the J9 demo', function () {
    Mail::fake();
    Storage::fake('local');      // the demo ID images never reach the real storage folder
    Storage::fake('public');
    config(['services.facepp.fake' => 'pass']);

    expect(Artisan::call('db:seed', ['--force' => true]))->toBe(0);

    $owner = User::where('email', 'seller1@lpg.com')->firstOrFail();
    $main = Store::where('user_id', $owner->id)->whereNull('parent_store_id')->firstOrFail();
    $branch = Store::where('parent_store_id', $main->id)->where('branch_name', 'Imus Branch')->firstOrFail();
    expect($main->subscription_plan)->toBe('premium')->and($branch->status)->toBe('approved')
        ->and(User::where('email', 'branchmanager1@lpg.com')->value('store_id'))->toBe($branch->id)
        ->and(SalesHistory::where('store_id', $main->id)->count())->toBeGreaterThan(100)
        ->and(SalesHistory::where('store_id', $branch->id)->count())->toBe(0);   // a new outlet has no 2-year history
    // seller2's demo trial follows the config trial length (K9)
    $s2 = Store::whereHas('owner', fn ($q) => $q->where('email', 'seller2@lpg.com'))->firstOrFail();
    expect((int) round(now()->diffInDays($s2->subscription_expires_at)))->toBe(\App\Services\SubscriptionService::trialDays());
});

test('Store::mainStores() works (main stores only)', function () {
    $main = $this->makeStore();
    $this->makeBranch($main);

    expect(Store::mainStores()->count())->toBe(1)->and(Store::mainStores()->value('id'))->toBe($main->id)
        ->and(Store::count())->toBe(2);
});
