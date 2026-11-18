<?php

use App\Models\StoreRole;
use App\Models\User;
use App\Services\StaffAccess;
use App\Services\StoreRoleService;
use Illuminate\Support\Facades\Mail;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Mail::fake();
    $this->store = $this->makeStore();
    $this->owner = User::find($this->store->user_id);
    StoreRoleService::seedStarters($this->store);
    // A rate on the starter roles so the "hourly pay for this role" question doesn't apply
    StoreRole::where('store_id', $this->store->id)->update(['hourly_rate' => 70]);
    $this->rider = StoreRole::where('store_id', $this->store->id)->where('starter_key', 'rider')->value('id');
    $this->payload = fn (array $extra) => $extra + [
        'first_name' => 'Emilio', 'last_name' => 'Jacinto', 'email' => 'emilio' . uniqid() . '@example.com',
        'schedule_start' => '08:00', 'schedule_end' => '17:00', 'work_days' => [1, 2, 3, 4, 5, 6],
    ];
});

test('Add Staff without any role → validation error, no account', function () {
    $this->actingAs($this->owner)->post('/seller/staff', ($this->payload)([]))->assertSessionHasErrors(['role_ids' => 'Choose at least one role.']);
    $this->actingAs($this->owner)->post('/seller/staff', ($this->payload)(['role_ids' => []]))->assertSessionHasErrors('role_ids');
    expect(User::where('first_name', 'Emilio')->exists())->toBeFalse();
});

test('Add Staff with only Rider → exactly the rider role (no cashier)', function () {
    $this->actingAs($this->owner)->post('/seller/staff', ($this->payload)(['role_ids' => [$this->rider]]))->assertSessionHasNoErrors();

    $u = User::where('first_name', 'Emilio')->firstOrFail();
    expect(StaffAccess::roles($u)->pluck('starter_key')->all())->toBe(['rider'])
        ->and($u->sub_role)->toBe('rider');

    // Edit keeps exactly what was ticked (nothing added)
    $this->actingAs($this->owner)->put("/seller/staff/{$u->id}", ($this->payload)(['role_ids' => [$this->rider], 'email' => $u->email]))->assertSessionHasNoErrors();
    expect(StaffAccess::roles($u->fresh())->pluck('starter_key')->all())->toBe(['rider']);
});
