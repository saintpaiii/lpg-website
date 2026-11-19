<?php

use App\Support\StoreContext;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

test('an owner without branches works in their main store, exactly as before (no switcher)', function () {
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);

    expect(StoreContext::for($owner)->id)->toBe($main->id)->and(StoreContext::ownedStoreIds($owner))->toBe([$main->id]);
    $this->actingAs($owner)->get('/seller/dashboard')->assertOk()
        ->assertInertia(fn ($p) => $p->where('auth.store.id', $main->id)->where('auth.store.is_branch', false)->where('auth.owned_stores', null));
});

test('switching to a branch → seller pages act on the branch; back to main; ?store= in a link switches too', function () {
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);
    $branch = $this->makeBranch($main);
    $pm = $this->makeProduct($main, 11);
    $pb = $this->makeProduct($branch, 22);

    $this->actingAs($owner)->post('/seller/switch-store', ['store_id' => $branch->id])->assertRedirect('/seller/dashboard');
    $this->actingAs($owner)->get('/seller/dashboard')->assertOk()
        ->assertInertia(fn ($p) => $p->where('auth.store.id', $branch->id)->where('auth.store.is_branch', true)
            ->where('auth.owned_stores', fn ($s) => collect($s)->pluck('id')->sort()->values()->all() === collect([$main->id, $branch->id])->sort()->values()->all()));
    // Inventory lists the BRANCH's products only
    $this->actingAs($owner)->get('/seller/inventory')->assertOk()
        ->assertInertia(fn ($p) => $p->where('inventories.data', fn ($rows) => collect($rows)->pluck('product.id')->all() === [$pb->id]));

    $this->actingAs($owner)->post('/seller/switch-store', ['store_id' => $main->id]);
    $this->actingAs($owner)->get('/seller/inventory')->assertOk()
        ->assertInertia(fn ($p) => $p->where('inventories.data', fn ($rows) => collect($rows)->pluck('product.id')->all() === [$pm->id]));

    // A notification link "?store=ID" opens that store
    $this->actingAs($owner)->get("/seller/inventory?store={$branch->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->where('auth.store.id', $branch->id));
});

test("switching to another owner's store → 403; a pending branch can't be opened", function () {
    $main = $this->makeStore();
    $owner = $this->ownerOf($main);
    $other = $this->makeStore();
    $pending = $this->makeBranch($main, 'Kawit Branch', ['status' => 'pending']);

    $this->actingAs($owner)->post('/seller/switch-store', ['store_id' => $other->id])->assertForbidden();
    $this->actingAs($owner)->post('/seller/switch-store', ['store_id' => $pending->id])->assertSessionHas('error');
    // A forged ?store= of someone else is ignored
    $this->actingAs($owner)->get("/seller/dashboard?store={$other->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $main->id));
    expect(StoreContext::for($owner)->id)->toBe($main->id);
});

test("staff work in their store_id; a Branch Manager can't switch stores", function () {
    $main = $this->makeStore();
    $branch = $this->makeBranch($main);
    $bm = $this->makeBranchManager($branch);

    expect(StoreContext::for($bm)->id)->toBe($branch->id)->and(StoreContext::isBranchManager($bm))->toBeTrue();
    $this->actingAs($bm)->post('/seller/switch-store', ['store_id' => $main->id])->assertForbidden();
    $this->actingAs($bm)->get("/seller/dashboard?store={$main->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $branch->id));
});
