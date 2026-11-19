<?php

use App\Models\Notification;
use App\Models\Store;
use App\Services\StoreReviewService;
use App\Support\StoreDocuments;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

beforeEach(function () {
    Storage::fake('local');
    $this->payload = fn (array $extra = []) => $extra + [
        'branch_name' => 'Imus Branch', 'address' => '45 Aguinaldo Hwy', 'city' => 'Imus', 'barangay' => 'Anabu I-A', 'province' => 'Cavite',
        'phone' => '09171234500', 'latitude' => 14.3929, 'longitude' => 120.9406, 'always_open' => '1', 'copy_products' => '1',
        'business_permit' => UploadedFile::fake()->create('bp.pdf', 50, 'application/pdf'),
        'fsic_permit'     => UploadedFile::fake()->create('fsic.pdf', 50, 'application/pdf'),
        'doe_lpg_license' => UploadedFile::fake()->create('doe.pdf', 50, 'application/pdf'),
        'business_permit_valid_until' => now()->addYear()->toDateString(),
        'fsic_permit_valid_until'     => now()->addYear()->toDateString(),
        'doe_lpg_license_valid_until' => now()->addYears(3)->toDateString(),
    ];
});

test('main store on Basic, Pro or the free trial → refused with the Premium message (no branch)', function (string $plan) {
    $main = $this->makeStore(['subscription_plan' => $plan]);
    $owner = $this->ownerOf($main);

    $this->actingAs($owner)->get('/seller/branches')->assertOk()
        ->assertInertia(fn ($p) => $p->where('canAdd', false)->where('blocker', fn ($b) => str_contains($b, 'paid Premium')));
    $this->actingAs($owner)->post('/seller/branches', ($this->payload)())
        ->assertRedirect()->assertSessionHas('error', fn ($m) => str_contains($m, 'paid Premium'));
    expect(Store::whereNotNull('parent_store_id')->count())->toBe(0);
})->with(['basic', 'pro', 'trial']);

test('paid Premium → a pending branch (same owner, "Main — Branch" name, own invoice code, inherited docs accepted); admins told; products copied with 0 stock', function () {
    $admin = $this->makeAdmin();
    $main = $this->makeStore(['store_name' => 'Bonifacio LPG Center']);
    $owner = $this->ownerOf($main);
    $this->makeProduct($main, 11);

    $this->actingAs($owner)->post('/seller/branches', ($this->payload)())->assertRedirect('/seller/branches')->assertSessionHasNoErrors();

    $b = Store::whereNotNull('parent_store_id')->firstOrFail();
    expect($b->status)->toBe('pending')->and($b->user_id)->toBe($main->user_id)->and($b->parent_store_id)->toBe($main->id)
        ->and($b->store_name)->toBe('Bonifacio LPG Center — Imus Branch')->and($b->branch_name)->toBe('Imus Branch')
        ->and($b->bir_permit)->toBe($main->bir_permit)                                  // referenced, not copied
        ->and($b->invoice_prefix)->toStartWith(substr(\App\Services\InvoiceService::ensurePrefix($main->fresh()), 0, 3))->not->toBe($main->fresh()->invoice_prefix)
        ->and($b->document_reviews['bir_permit']['status'])->toBe('accepted')->and($b->document_reviews['bir_permit']['inherited'])->toBeTrue()
        ->and($b->business_permit_expires_at->toDateString())->toBe(now()->addYear()->toDateString())
        ->and($b->products()->count())->toBe(1)->and((int) $b->products()->first()->inventory->quantity)->toBe(0);
    expect(Notification::where('user_id', $admin->id)->where('message', 'New branch for review: Bonifacio LPG Center — Imus Branch')->exists())->toBeTrue();
    // The Branch Manager starter role exists in the branch only
    expect(\App\Models\StoreRole::where('store_id', $b->id)->where('starter_key', 'branch_manager')->exists())->toBeTrue()
        ->and(\App\Models\StoreRole::where('store_id', $main->id)->where('starter_key', 'branch_manager')->exists())->toBeFalse();

    // Same name again → refused
    $this->actingAs($owner)->post('/seller/branches', ($this->payload)())->assertSessionHasErrors(['branch_name' => 'You already have a branch with this name.']);
});

test('the documents\' valid-until rules apply (expired, too far ahead, missing)', function () {
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);

    $this->actingAs($owner)->post('/seller/branches', ($this->payload)([
        'business_permit_valid_until' => now()->subDay()->toDateString(),                      // expired
        'fsic_permit_valid_until'     => now()->addYears(3)->toDateString(),                    // FSIC: at most 2 years
        'doe_lpg_license_valid_until' => '',
    ]))->assertSessionHasErrors(['business_permit_valid_until', 'fsic_permit_valid_until', 'doe_lpg_license_valid_until']);
    expect(Store::whereNotNull('parent_store_id')->count())->toBe(0);
});

test('admin: the branch review shows the 3 branch documents + inherited ones (read-only); approve → its own 14-day trial and visible to customers', function () {
    $admin = $this->makeAdmin();
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);
    $this->actingAs($owner)->post('/seller/branches', ($this->payload)())->assertSessionHasNoErrors();
    $b = Store::whereNotNull('parent_store_id')->firstOrFail();

    $docs = collect(StoreReviewService::documents($b));
    expect($docs->where('inherited', false)->pluck('key')->sort()->values()->all())->toBe(['business_permit', 'doe_lpg_license', 'fsic_permit'])
        ->and($docs->where('inherited', true)->pluck('key')->all())->toContain('bir_permit');
    // An inherited document can't be decided again
    $this->actingAs($admin)->post("/admin/stores/{$b->id}/review/bir_permit", ['decision' => 'reject', 'reason' => 'Other', 'note' => 'x'])->assertSessionHas('error');

    // Accept the branch's own documents + the two checklist items, then approve
    foreach (['business_permit', 'fsic_permit', 'doe_lpg_license'] as $k) {
        $this->actingAs($admin)->post("/admin/stores/{$b->id}/review/{$k}", ['decision' => 'accept', 'expires_at' => now()->addYear()->toDateString()])->assertSessionHasNoErrors();
    }
    foreach (StoreDocuments::REVIEW_ITEMS as $k) {
        $this->actingAs($admin)->post("/admin/stores/{$b->id}/review/{$k}", ['decision' => 'accept']);
    }
    $this->actingAs($admin)->patch("/admin/stores/{$b->id}/approve")->assertSessionHas('success');

    $b->refresh();
    expect($b->status)->toBe('approved')->and($b->subscription_plan)->toBe('trial')
        ->and((int) round(now()->diffInDays($b->subscription_expires_at)))->toBe(14)
        ->and(Store::visibleToCustomers()->whereKey($b->id)->exists())->toBeTrue()
        ->and(\App\Services\SubscriptionService::hasFeature($b, 'branches'))->toBeFalse();
    // The admin store list: "Branch of …" + the Branches filter
    $this->actingAs($admin)->get('/admin/stores?tab=approved&kind=branches')->assertOk()
        ->assertInertia(fn ($p) => $p->where('stores.data', fn ($rows) => collect($rows)->pluck('id')->all() === [$b->id]
            && collect($rows)->first()['branch_of']['id'] === $main->id));
});
