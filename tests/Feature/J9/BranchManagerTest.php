<?php

use App\Models\StoreRole;
use App\Models\User;
use App\Services\StaffAccess;
use Illuminate\Support\Facades\Mail;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

beforeEach(function () {
    Mail::fake();
    $this->main = $this->makeStore();
    $this->owner = $this->ownerOf($this->main);
    $this->branch = $this->makeBranch($this->main);
    \App\Services\StoreRoleService::seedStarters($this->main);
    \App\Services\StoreRoleService::seedStarters($this->branch);
    StoreRole::whereIn('store_id', [$this->main->id, $this->branch->id])->update(['hourly_rate' => 70]);
    $this->bmRole = StoreRole::where('store_id', $this->branch->id)->where('starter_key', 'branch_manager')->value('id');
    $this->staff = fn (array $roles, string $email) => [
        'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => $email, 'role_ids' => $roles,
        'schedule_start' => '08:00', 'schedule_end' => '17:00', 'work_days' => [1, 2, 3, 4, 5, 6],
    ];
});

test('the Branch Manager role is offered only when the owner works in a branch', function () {
    $this->actingAs($this->owner)->get('/seller/staff')->assertOk()
        ->assertInertia(fn ($p) => $p->where('roles', fn ($r) => ! collect($r)->contains('starter_key', 'branch_manager')));
    $this->actingAs($this->owner)->post('/seller/switch-store', ['store_id' => $this->branch->id]);
    $this->actingAs($this->owner)->get('/seller/staff')->assertOk()
        ->assertInertia(fn ($p) => $p->where('roles', fn ($r) => collect($r)->contains('starter_key', 'branch_manager'))
            ->where('templates', fn ($t) => ! collect($t)->contains('key', 'branch_manager')));
});

test('at most ONE active Branch Manager per branch; the account belongs to the branch', function () {
    $this->actingAs($this->owner)->post('/seller/switch-store', ['store_id' => $this->branch->id]);
    $this->actingAs($this->owner)->post('/seller/staff', ($this->staff)([$this->bmRole], 'bm1@example.com'))->assertSessionHasNoErrors();
    $bm = User::where('email', 'bm1@example.com')->firstOrFail();
    expect($bm->store_id)->toBe($this->branch->id)->and(StaffAccess::hasStarter($bm, 'branch_manager'))->toBeTrue();

    $this->actingAs($this->owner)->post('/seller/staff', ($this->staff)([$this->bmRole], 'bm2@example.com'))
        ->assertSessionHasErrors(['role_ids' => 'This branch already has a Branch Manager.']);
    expect(User::where('email', 'bm2@example.com')->exists())->toBeFalse();
});

test('a Branch Manager manages the branch: orders, inventory, staff (not their own account, not roles)', function () {
    $bm = $this->makeBranchManager($this->branch);
    $p = $this->makeProduct($this->branch, 11);

    $this->actingAs($bm)->get('/seller/orders')->assertOk();
    $this->actingAs($bm)->get('/seller/inventory')->assertOk();
    $this->actingAs($bm)->patch("/seller/inventory/{$p->id}/reorder-level", ['reorder_level' => 7])->assertSessionHasNoErrors();
    expect((int) $p->inventory()->value('reorder_level'))->toBe(7);
    $this->actingAs($bm)->get('/seller/staff')->assertOk();
    $this->actingAs($bm)->get('/seller/vehicles')->assertOk();

    $cashier = StoreRole::where('store_id', $this->branch->id)->where('starter_key', 'cashier')->value('id');
    $this->actingAs($bm)->post('/seller/staff', ($this->staff)([$cashier], 'cashier.branch@example.com'))->assertSessionHasNoErrors();
    expect(User::where('email', 'cashier.branch@example.com')->value('store_id'))->toBe($this->branch->id);

    $this->actingAs($bm)->put("/seller/staff/{$bm->id}", ($this->staff)([$cashier], $bm->email))->assertForbidden();
    $this->actingAs($bm)->post('/seller/roles', ['name' => 'X', 'modules' => []])->assertForbidden();
});

test('a Branch Manager gets 403 on plan / billing, Branches, the main dashboard, the switcher and other stores', function () {
    $bm = $this->makeBranchManager($this->branch);
    [, $c] = $this->makeCustomer();
    $mainOrder = $this->makeOrder($c, $this->main, [[$this->makeProduct($this->main, 11), 1]]);
    $mainStaff = $this->makeUser(['role' => 'seller_staff', 'store_id' => $this->main->id]);

    $this->actingAs($bm)->get('/seller/plan')->assertForbidden();
    $this->actingAs($bm)->get('/seller/branches')->assertForbidden();
    $this->actingAs($bm)->get('/seller/main-dashboard')->assertForbidden();
    $this->actingAs($bm)->post('/seller/switch-store', ['store_id' => $this->main->id])->assertForbidden();
    $this->actingAs($bm)->get("/seller/staff/{$mainStaff->id}")->assertForbidden();
    expect($this->actingAs($bm)->get("/seller/orders/{$mainOrder->id}")->status())->toBeIn([403, 404]);
    $this->actingAs($bm)->get('/seller/dashboard')->assertOk()
        ->assertInertia(fn ($p) => $p->where('auth.is_branch_manager', true)->where('auth.owned_stores', null));
});
