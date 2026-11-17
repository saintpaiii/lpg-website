<?php

namespace Tests\Concerns;

use App\Models\Attendance;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Minimal store / rider / customer / product / vehicle / order fixtures for feature tests (J6).
 * Rows are created directly (only the User model has a factory).
 */
trait BuildsLpgWorld
{
    protected function makeUser(array $attrs = []): User
    {
        return User::forceCreate($attrs + [
            'name'                   => 'User ' . Str::random(5),
            'email'                  => Str::random(8) . '@test.lpg',
            'password'               => Hash::make('password'),
            'phone'                  => '0917' . random_int(1000000, 9999999),
            'role'                   => 'customer',
            'is_active'              => true,
            'id_verified'            => true,
            'id_verification_status' => 'verified',
            'id_verified_at'         => now(),
            'email_verified_at'      => now(),
        ]);
    }

    protected function makeAdmin(): User
    {
        return $this->makeUser(['name' => 'Admin', 'role' => 'admin', 'is_admin' => true]);
    }

    /** A seller (owner) with an approved store on a paid plan, pinned in Imus. */
    protected function makeStore(array $storeAttrs = []): Store
    {
        $owner = $this->makeUser(['name' => 'Owner ' . Str::random(4), 'role' => 'seller']);
        $id = DB::table('stores')->insertGetId($storeAttrs + [
            'user_id'                 => $owner->id,
            'store_name'              => 'Store ' . Str::random(4),
            'address'                 => '1 Rizal St.',
            'city'                    => 'Imus',
            'barangay'                => 'Alapan I-A',
            'province'                => 'Cavite',
            'phone'                   => '09171234567',
            'bir_permit'              => 'permits/x.pdf',
            'business_permit'         => 'permits/y.pdf',
            'latitude'                => 14.4100000,
            'longitude'               => 120.9400000,
            'status'                  => 'approved',
            'subscription_plan'       => 'premium',
            'subscription_started_at' => now()->subDays(5),
            'subscription_expires_at' => now()->addDays(30),
            'approved_at'             => now()->subDays(5),
            'created_at'              => now(),
            'updated_at'              => now(),
        ]);
        $owner->forceFill(['store_id' => $id])->save();

        return Store::findOrFail($id);
    }

    protected function makeRider(Store $store, array $attrs = []): User
    {
        return $this->makeUser($attrs + ['name' => 'Rider ' . Str::random(4), 'first_name' => 'Rider' . Str::random(3), 'role' => 'seller_staff', 'sub_role' => 'rider', 'store_id' => $store->id]);
    }

    /** A customer account + its customers row. */
    protected function makeCustomer(array $attrs = []): array
    {
        $user = $this->makeUser($attrs + ['name' => 'Customer ' . Str::random(4), 'role' => 'customer']);
        $customer = Customer::forceCreate([
            'user_id' => $user->id, 'name' => $user->name, 'address' => '2 Mabini St.', 'city' => 'Imus', 'barangay' => 'Alapan I-A', 'phone' => $user->phone,
        ]);

        return [$user, $customer];
    }

    protected function makeProduct(Store $store, float $gasKg, float $refill = 700, float $purchase = 900, int $stock = 50): Product
    {
        $p = Product::forceCreate([
            'store_id' => $store->id, 'name' => $gasKg . 'kg LPG', 'brand' => 'Petron Gasul', 'weight_kg' => $gasKg, 'weight' => $gasKg . 'kg',
            'selling_price' => $purchase, 'cost_price' => $refill - 100, 'refill_price' => $refill, 'purchase_price' => $purchase, 'is_active' => true,
        ]);
        Inventory::forceCreate(['product_id' => $p->id, 'quantity' => $stock, 'reorder_level' => 5]);

        return $p;
    }

    protected function makeVehicle(Store $store, string $type, float $kg, int $tanks, ?array $limits = null, string $status = 'available'): Vehicle
    {
        DB::table('store_delivery_rates')->updateOrInsert(['store_id' => $store->id, 'vehicle_type' => $type], ['base_fee' => 50, 'fee_per_km' => 10, 'created_at' => now(), 'updated_at' => now()]);

        return Vehicle::forceCreate([
            'store_id' => $store->id, 'vehicle_type' => $type, 'plate_number' => strtoupper(Str::random(3)) . '-' . random_int(100, 999),
            'max_capacity_kg' => $kg, 'max_tanks' => $tanks, 'tank_limits' => $limits, 'status' => $status,
        ]);
    }

    protected function clockIn(User $rider, ?Vehicle $vehicle): Attendance
    {
        return Attendance::forceCreate([
            'user_id' => $rider->id, 'store_id' => $rider->store_id, 'date' => now()->toDateString(), 'clock_in' => now()->subHour(),
            'status' => 'present', 'vehicle_id' => $vehicle?->id,
        ]);
    }

    /** @param array<int, array{0: Product, 1: int}> $lines */
    protected function makeOrder(Customer $customer, Store $store, array $lines, array $attrs = []): Order
    {
        $total = collect($lines)->sum(fn ($l) => (float) $l[0]->refill_price * $l[1]);
        $order = Order::forceCreate($attrs + [
            'order_number' => 'ORD-T-' . strtoupper(Str::random(6)), 'customer_id' => $customer->id, 'store_id' => $store->id,
            'transaction_type' => 'refill', 'status' => 'confirmed', 'total_amount' => $total, 'shipping_fee' => 50,
            'payment_method' => 'cash', 'payment_status' => 'unpaid', 'payment_mode' => 'cod', 'ordered_at' => now(),
            'created_by' => $customer->user_id, 'fulfillment' => 'delivery', 'delivery_latitude' => 14.4200000, 'delivery_longitude' => 120.9500000,
        ]);
        foreach ($lines as [$p, $q]) {
            OrderItem::forceCreate(['order_id' => $order->id, 'product_id' => $p->id, 'quantity' => $q, 'unit_price' => $p->refill_price, 'subtotal' => $p->refill_price * $q, 'transaction_type' => 'refill']);
        }

        return $order->fresh('items.product');
    }

    protected function makeDelivery(Order $order, User $rider, string $status = 'in_transit', array $attrs = []): Delivery
    {
        return Delivery::forceCreate($attrs + ['order_id' => $order->id, 'store_id' => $order->store_id, 'rider_id' => $rider->id, 'status' => $status, 'assigned_at' => now()->subMinutes(20)]);
    }
}
