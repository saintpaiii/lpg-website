<?php

use App\Models\ConversationMessage;
use App\Services\ChatService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    Storage::fake('local');
    Storage::fake('public');
    // 1×1 JPEG (GD is not needed — UploadedFile::fake()->image() would require it)
    $this->jpeg = fn (string $name = 'tank.jpg') => UploadedFile::fake()->createWithContent($name, base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
    $this->store = $this->makeStore();
    [$this->user, $customer] = $this->makeCustomer();
    [$this->other] = $this->makeCustomer();
    // Customers chat with a store they have ordered from
    $this->makeOrder($customer, $this->store, [[$this->makeProduct($this->store, 11), 1]]);
    $this->conv = ChatService::customerStoreConversation($this->user->id, $this->store->id);
});

test('a location can be sent without a message body', function () {
    $res = $this->actingAs($this->user)->postJson("/customer/messages/{$this->conv->id}", ['latitude' => 14.4123456, 'longitude' => 120.9412345, 'location_label' => 'Rizal St., Imus'])
        ->assertCreated();

    expect($res->json('message.location'))->toMatchArray(['lat' => 14.4123456, 'lng' => 120.9412345, 'label' => 'Rizal St., Imus', 'google_url' => 'https://www.google.com/maps?q=14.4123456,120.9412345'])
        ->and($res->json('message.body'))->toBeNull()
        ->and($this->conv->fresh()->last_message_preview)->toBe('📍 Location');
});

test('coordinates outside the Philippines are rejected', function () {
    $this->actingAs($this->user)->postJson("/customer/messages/{$this->conv->id}", ['latitude' => 35.68, 'longitude' => 139.69])
        ->assertStatus(422)->assertJsonValidationErrors(['latitude', 'longitude']);
    $this->actingAs($this->user)->postJson("/customer/messages/{$this->conv->id}", [])->assertStatus(422)->assertJsonValidationErrors('body');
});

test('a non-participant cannot read the conversation, its location or its photo', function () {
    $this->actingAs($this->user)->postJson("/customer/messages/{$this->conv->id}", ['latitude' => 14.41, 'longitude' => 120.94])->assertCreated();
    $this->actingAs($this->user)->post("/customer/messages/{$this->conv->id}", ['image' => ($this->jpeg)()], ['Accept' => 'application/json'])->assertCreated();
    $photo = ConversationMessage::whereNotNull('attachment_path')->latest('id')->first();

    $this->actingAs($this->other)->getJson("/customer/messages/{$this->conv->id}")->assertForbidden();
    $this->actingAs($this->other)->get("/chat/attachments/{$photo->id}")->assertForbidden();
});

test('a photo upload goes to the private disk and is served only to participants (and admin)', function () {
    $res = $this->actingAs($this->user)->post("/customer/messages/{$this->conv->id}", ['image' => ($this->jpeg)()], ['Accept' => 'application/json'])
        ->assertCreated();
    $m = ConversationMessage::find($res->json('message.id'));

    expect($m->attachment_path)->toStartWith('chat_private/')
        ->and(Storage::disk('local')->exists($m->attachment_path))->toBeTrue()
        ->and(Storage::disk('public')->exists($m->attachment_path))->toBeFalse()
        ->and($res->json('message.attachment_url'))->toEndWith("/chat/attachments/{$m->id}")
        ->and($this->conv->fresh()->last_message_preview)->toBe('📷 Photo');

    $this->actingAs($this->user)->get("/chat/attachments/{$m->id}")->assertOk();
    $this->actingAs(\App\Models\User::find($this->store->user_id))->get("/chat/attachments/{$m->id}")->assertOk();
    $this->actingAs($this->makeAdmin())->get("/chat/attachments/{$m->id}")->assertOk();
    $this->actingAs($this->other)->get("/chat/attachments/{$m->id}")->assertForbidden();
});

test('old public chat photos keep their public URL', function () {
    Storage::disk('public')->put("chat_attachments/{$this->conv->id}/old.jpg", 'x');
    $m = ConversationMessage::create(['conversation_id' => $this->conv->id, 'sender_id' => $this->user->id, 'sender_side' => 'customer', 'attachment_path' => "chat_attachments/{$this->conv->id}/old.jpg"]);

    expect($m->attachment_url)->toContain("/storage/chat_attachments/{$this->conv->id}/old.jpg");
});
