<?php

use App\Support\StoreContext;

uses(Tests\Concerns\BuildsLpgWorld::class, Tests\Concerns\BuildsBranches::class);

beforeEach(function () {
    $this->main = $this->makeStore();
    $this->owner = $this->ownerOf($this->main);
    $this->branch = $this->makeBranch($this->main);
    [, $this->c] = $this->makeCustomer();
    $this->pm = $this->makeProduct($this->main, 11);
    $this->mainOrder = $this->makeOrder($this->c, $this->main, [[$this->pm, 1]]);
    $this->actingAs($this->owner)->post('/seller/switch-store', ['store_id' => $this->branch->id]);   // working in the BRANCH
});

test("an owner working in the branch opens a MAIN-store order → 200, switched to the main store, toast", function () {
    $this->actingAs($this->owner)->get("/seller/orders/{$this->mainOrder->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->where('auth.store.id', $this->main->id)
            ->where('flash.info', "Switched to {$this->main->store_name}"));
    expect(StoreContext::for($this->owner)->id)->toBe($this->main->id);
});

test('the same for an invoice, a product batch link (?batches=), a chat (?c=) and a staff record of the other store', function () {
    $invoice = \App\Services\InvoiceService::issue($this->mainOrder->fresh());
    $this->actingAs($this->owner)->get("/seller/invoices/{$invoice->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $this->main->id));

    $pb = $this->makeProduct($this->branch, 11);
    $this->actingAs($this->owner)->get("/seller/inventory?batches={$pb->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $this->branch->id));

    $conv = \App\Models\Conversation::forceCreate(['type' => \App\Models\Conversation::CUSTOMER_STORE, 'customer_id' => $this->c->user_id, 'store_id' => $this->main->id]);
    $this->actingAs($this->owner)->get("/seller/messages?c={$conv->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $this->main->id));

    $rider = $this->makeRider($this->branch);
    $this->actingAs($this->owner)->get("/seller/staff/{$rider->id}")->assertOk()->assertInertia(fn ($p) => $p->where('auth.store.id', $this->branch->id));
});

test("a Branch Manager opening a main-store order → still 403; another owner → still 403 (no switch)", function () {
    $bm = $this->makeBranchManager($this->branch);
    expect($this->actingAs($bm)->get("/seller/orders/{$this->mainOrder->id}")->status())->toBeIn([403, 404]);
    expect(StoreContext::for($bm)->id)->toBe($this->branch->id);

    $other = $this->makeStore();
    $otherOwner = $this->ownerOf($other);
    expect($this->actingAs($otherOwner)->get("/seller/orders/{$this->mainOrder->id}")->status())->toBeIn([403, 404]);
    expect(StoreContext::for($otherOwner)->id)->toBe($other->id);
});
