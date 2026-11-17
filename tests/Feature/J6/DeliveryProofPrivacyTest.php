<?php

use App\Models\DeliveryProof;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    // 1×1 JPEG (GD is not needed — UploadedFile::fake()->image() would require it)
    $this->jpeg = fn (string $name = 'tank.jpg') => UploadedFile::fake()->createWithContent($name, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    $this->store = $this->makeStore();
    $this->rider = $this->makeRider($this->store);
    $this->clockIn($this->rider, $this->makeVehicle($this->store, 'tricycle', 150, 6));
    [$this->user, $customer] = $this->makeCustomer();
    [$this->other] = $this->makeCustomer();
    $this->order = $this->makeOrder($customer, $this->store, [[$this->makeProduct($this->store, 11), 1]], ['status' => 'out_for_delivery']);
    $this->delivery = $this->makeDelivery($this->order, $this->rider, 'in_transit');
});

test('a new proof photo is saved on the private disk; the customer of the order sees it, another customer gets 403', function () {
    $this->actingAs($this->rider)->patch("/rider/deliveries/{$this->delivery->id}/status", [
        'status' => 'delivered', 'empty_tanks_collected' => '1', 'photo' => ($this->jpeg)('proof.jpg'),
    ])->assertSessionHasNoErrors();

    $proof = DeliveryProof::where('delivery_id', $this->delivery->id)->whereNotNull('photo_path')->firstOrFail();
    expect(Storage::disk('local')->exists($proof->photo_path))->toBeTrue()
        ->and(Storage::disk('public')->exists($proof->photo_path))->toBeFalse()
        ->and($proof->photo_url)->toEndWith("/documents/delivery-proof/{$proof->id}/photo_path");

    $url = "/documents/delivery-proof/{$proof->id}/photo_path";
    $this->actingAs($this->user)->get($url)->assertOk();
    $this->actingAs($this->rider)->get($url)->assertOk();
    $this->actingAs(\App\Models\User::find($this->store->user_id))->get($url)->assertOk();
    $this->actingAs($this->makeAdmin())->get($url)->assertOk();
    $this->actingAs($this->other)->get($url)->assertForbidden();
});

test('an old proof still on the public disk keeps showing, and proofs:move-private is a dry run by default', function () {
    Storage::disk('public')->put('delivery_proofs/old.jpg', 'x');
    $proof = DeliveryProof::create(['delivery_id' => $this->delivery->id, 'user_id' => $this->rider->id, 'status' => 'delivered', 'photo_path' => 'delivery_proofs/old.jpg']);

    expect($proof->photo_url)->toContain('/storage/delivery_proofs/old.jpg');

    $this->artisan('proofs:move-private')->expectsOutputToContain('[dry run] would move 1')->assertSuccessful();
    expect(Storage::disk('public')->exists('delivery_proofs/old.jpg'))->toBeTrue();

    $this->artisan('proofs:move-private', ['--force' => true])->expectsOutputToContain('Moved 1')->assertSuccessful();
    expect(Storage::disk('public')->exists('delivery_proofs/old.jpg'))->toBeFalse()
        ->and(Storage::disk('local')->exists('delivery_proofs/old.jpg'))->toBeTrue()
        ->and($proof->fresh()->photo_url)->toEndWith("/documents/delivery-proof/{$proof->id}/photo_path");
});
