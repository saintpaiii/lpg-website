<?php

use App\Models\CartItem;
use App\Models\OrderItem;
use App\Services\DeliveryFeeService;
use App\Services\HandoverAdjustmentService;
use App\Services\InvoiceService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

uses(Tests\Concerns\BuildsLpgWorld::class);

beforeEach(function () {
    $this->store = $this->makeStore();
    $this->hose = $this->makeAccessory($this->store, 'LPG Hose 1.5 m', 180, 0.4);
    $this->p11 = $this->makeProduct($this->store, 11, 750, 950);
});

test('an accessory in the cart is always a new purchase', function () {
    [$user] = $this->makeCustomer();
    $ci = CartItem::create(['user_id' => $user->id, 'product_id' => $this->hose->id, 'store_id' => $this->store->id, 'quantity' => 2, 'transaction_type' => 'refill']);
    expect($ci->fresh()->transaction_type)->toBe('new_purchase');

    $ci->update(['transaction_type' => 'refill']);
    expect($ci->fresh()->transaction_type)->toBe('new_purchase');
});

test('accessory weight = unit weight, and it counts 0 tanks for the vehicle fit', function () {
    expect(DeliveryFeeService::itemKg($this->hose))->toBe(0.4)
        ->and(DeliveryFeeService::itemKg($this->makeAccessory($this->store, 'No weight', 50, 0)))->toBe(1.0);

    $load = DeliveryFeeService::orderLoad([['product' => $this->p11, 'quantity' => 2], ['product' => $this->hose, 'quantity' => 3]]);
    expect($load)->toMatchArray(['kg' => 51.2, 'tanks' => 2, 'by_size' => ['11' => 2]]);

    // A motorcycle (60 kg / 2 tanks) carries 2 × 11 kg + 3 hoses: the hoses don't use up the tank count
    $moto = $this->makeVehicle($this->store, 'motorcycle', 60, 2, ['11' => 2]);
    expect(DeliveryFeeService::fits($moto, $load))->toBeNull();
});

test('checkout of an accessory needs no empty tank; the invoice line is fine', function () {
    $this->makeVehicle($this->store, 'tricycle', 150, 6);
    $this->giveLicense($this->makeRider($this->store));
    [$user] = $this->makeCustomer();
    CartItem::create(['user_id' => $user->id, 'product_id' => $this->hose->id, 'store_id' => $this->store->id, 'quantity' => 2, 'transaction_type' => 'new_purchase']);

    // No empty_tanks_confirmed — not needed for accessories
    $this->actingAs($user)->withSession(['cart_selected' => [$this->hose->id]])->postJson('/customer/checkout', ['notes' => '', 'fulfillments' => [$this->store->id => 'delivery'], 'payment_modes' => [$this->store->id => 'cod'],
        'delivery_latitude' => 14.42, 'delivery_longitude' => 120.95, 'delivery_address' => '2 Mabini St.', 'delivery_barangay' => 'Alapan I-A', 'delivery_city' => 'Imus'])
        ->assertOk();

    $item = OrderItem::where('product_id', $this->hose->id)->firstOrFail();
    $order = $item->order;
    expect($item->transaction_type)->toBe('new_purchase')
        ->and((float) $item->unit_price)->toBe(180.0)
        ->and((int) $order->empty_tanks_required)->toBe(0);

    $order->update(['status' => 'confirmed']);
    $invoice = InvoiceService::issue($order->fresh());
    expect($invoice)->not->toBeNull()
        ->and(substr(InvoiceService::pdf($invoice), 0, 4))->toBe('%PDF');
});

test('the J4 "tank not accepted" action is refused on an accessory item', function () {
    \Illuminate\Support\Facades\Storage::fake('local');
    [, $customer] = $this->makeCustomer();
    $order = $this->makeOrder($customer, $this->store, [[$this->hose, 1]], ['status' => 'out_for_delivery']);
    OrderItem::where('order_id', $order->id)->update(['transaction_type' => 'new_purchase']);
    $item = OrderItem::where('order_id', $order->id)->first();

    expect(HandoverAdjustmentService::refillItems($order->fresh()))->toBe([]);   // the button has nothing to show

    $request = Request::create('/', 'POST', [], [], ['not_accepted' => [0 => ['photo' => $this->jpegUpload()]]]);
    expect(fn () => HandoverAdjustmentService::apply($order, [['order_item_id' => $item->id, 'quantity' => 1, 'reason' => 'dented', 'choice' => 'cancel']], $request, $this->store->user_id, 'delivery'))
        ->toThrow(ValidationException::class);
});
