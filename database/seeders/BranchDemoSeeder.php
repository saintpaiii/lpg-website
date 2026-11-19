<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\StoreRole;
use App\Models\User;
use App\Services\BranchService;
use App\Services\StoreRoleService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * J9 demo: seller1's store on a PAID Premium plan with one approved branch "Imus Branch" — products and stock (11 kg low
 * at the branch, plenty at the main store → the main dashboard's transfer note), a Branch Manager
 * (branchmanager1@lpg.com / Password@123), a rider + vehicle, and a few orders so the main dashboard has data.
 */
class BranchDemoSeeder extends Seeder
{
    public function run(): void
    {
        $owner = User::where('email', 'seller1@lpg.com')->first();
        $main = $owner ? Store::where('user_id', $owner->id)->whereNull('parent_store_id')->first() : null;
        if (! $main || Store::where('parent_store_id', $main->id)->exists()) {
            return;
        }
        $now = now();

        // A PAID Premium main store (branches need it — the trial doesn't include them)
        $main->forceFill(['subscription_plan' => 'premium', 'subscription_started_at' => $now->copy()->subDays(5),
            'subscription_expires_at' => $now->copy()->addDays(25), 'is_featured' => true])->save();
        DB::table('subscription_payments')->insert([
            'store_id' => $main->id, 'plan_key' => 'premium', 'amount' => 1799, 'status' => 'paid', 'method' => 'paymongo', 'days' => 30,
            'period_start' => $now->copy()->subDays(5), 'period_end' => $now->copy()->addDays(25), 'paid_at' => $now->copy()->subDays(5),
            'notes' => 'Demo payment (J9)', 'created_at' => $now->copy()->subDays(5), 'updated_at' => $now,
        ]);

        $branch = Store::create([
            'user_id' => $owner->id, 'parent_store_id' => $main->id, 'branch_name' => 'Imus Branch',
            'store_name' => Store::branchDisplayName($main->store_name, 'Imus Branch'),
            'description' => $main->description, 'address' => '45 Aguinaldo Hwy', 'city' => 'Imus', 'barangay' => 'Anabu I-A', 'province' => 'Cavite',
            'phone' => '0464123456', 'email' => $main->email, 'logo' => $main->logo,
            'latitude' => 14.3929000, 'longitude' => 120.9406000,
            'bir_permit' => $main->bir_permit, 'dti_sec_registration' => $main->dti_sec_registration, 'dti_sec_kind' => $main->dti_sec_kind,
            'business_permit' => $main->business_permit, 'fsic_permit' => $main->fsic_permit, 'doe_lpg_license' => $main->doe_lpg_license,
            'business_permit_expires_at' => $now->copy()->addYear()->toDateString(), 'fsic_permit_expires_at' => $now->copy()->addYear()->toDateString(),
            'doe_lpg_license_expires_at' => $now->copy()->addYears(3)->toDateString(),
            'status' => 'approved', 'approved_at' => $now->copy()->subDays(4),
            'subscription_plan' => 'trial', 'subscription_started_at' => $now->copy()->subDays(4),
            'subscription_expires_at' => $now->copy()->addDays(\App\Services\SubscriptionService::trialDays() - 4), 'trial_used_at' => $now->copy()->subDays(4),
            'is_featured' => true, 'allow_cod' => true, 'allow_pickup' => true, 'max_delivery_radius_km' => $main->max_delivery_radius_km,
            'exchange_policy' => $main->exchange_policy,
        ]);
        $branch->forceFill(['invoice_prefix' => BranchService::prefixFor($main, 'Imus Branch')])->save();
        StoreRoleService::seedStarters($branch);
        foreach (DB::table('store_delivery_rates')->where('store_id', $main->id)->get() as $r) {
            DB::table('store_delivery_rates')->insert(['store_id' => $branch->id, 'vehicle_type' => $r->vehicle_type, 'base_fee' => $r->base_fee,
                'fee_per_km' => $r->fee_per_km, 'created_at' => $now, 'updated_at' => $now]);
        }

        // Products copied from the main store; branch stock: 11 kg LOW (3), the rest moderate
        BranchService::copyProducts($main, $branch);
        foreach (Product::where('store_id', $branch->id)->get() as $p) {
            Inventory::where('product_id', $p->id)->update(['quantity' => (float) $p->weight_kg == 11.0 ? 3 : 12, 'reorder_level' => 10]);
        }
        // Main store: plenty of 11 kg (> 2 × the reorder point) for the transfer suggestion
        foreach (Product::where('store_id', $main->id)->where('weight_kg', 11)->get() as $p) {
            Inventory::where('product_id', $p->id)->update(['quantity' => DB::raw('GREATEST(quantity, 45)'), 'reorder_level' => 10]);
        }

        // Branch Manager + a rider with a vehicle and an approved license
        $mk = fn (string $email, string $name, string $first, string $last, string $phone) => User::forceCreate([
            'name' => $name, 'first_name' => $first, 'last_name' => $last, 'email' => $email, 'password' => Hash::make('Password@123'),
            'phone' => $phone, 'role' => 'seller_staff', 'store_id' => $branch->id, 'is_active' => true, 'email_verified_at' => $now,
            'must_change_password' => false, 'schedule_start' => '08:00', 'schedule_end' => '17:00', 'work_days' => [1, 2, 3, 4, 5, 6],
            'created_at' => $now->copy()->subDays(3), 'updated_at' => $now,
        ]);
        $manager = $mk('branchmanager1@lpg.com', 'Liza Mercado', 'Liza', 'Mercado', '09171000021');
        $rider = $mk('branchrider1@lpg.com', 'Dante Ramos', 'Dante', 'Ramos', '09171000022');
        StoreRoleService::assign($manager, [StoreRole::where('store_id', $branch->id)->where('starter_key', 'branch_manager')->value('id')]);
        StoreRoleService::assign($rider, [StoreRole::where('store_id', $branch->id)->where('starter_key', 'rider')->value('id')]);
        StoreRole::where('store_id', $branch->id)->whereIn('starter_key', ['branch_manager', 'rider'])->update(['hourly_rate' => 75]);
        $vehicleId = DB::table('vehicles')->insertGetId([
            'store_id' => $branch->id, 'vehicle_type' => 'tricycle', 'plate_number' => 'IMB-401', 'max_capacity_kg' => 150, 'max_tanks' => 6,
            'status' => 'available', 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('staff_documents')->insert([
            'user_id' => $rider->id, 'store_id' => $branch->id, 'doc_type' => 'drivers_license', 'document_number' => 'N01-99-654321',
            'file_path' => "staff_documents/demo-license-{$rider->id}.jpg", 'expires_at' => $now->copy()->addYear()->toDateString(),
            'status' => 'approved', 'reviewed_by' => $owner->id, 'reviewed_at' => $now, 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('attendances')->insert([
            'user_id' => $rider->id, 'store_id' => $branch->id, 'date' => $now->toDateString(), 'clock_in' => $now->copy()->subHours(1),
            'status' => 'present', 'vehicle_id' => $vehicleId, 'created_at' => $now, 'updated_at' => $now,
        ]);

        // A few branch orders (delivered + paid, one cancelled, one pending) over the last days
        $customers = Customer::whereNotNull('user_id')->take(3)->get();
        $p11 = Product::where('store_id', $branch->id)->where('weight_kg', 11)->first();
        if ($p11 && $customers->isNotEmpty()) {
            $prefix = 'ORD-' . $now->format('Y') . '-B';
            foreach ([[1, 'delivered', 2], [2, 'delivered', 1], [3, 'delivered', 3], [5, 'cancelled', 1], [0, 'pending', 2]] as $i => [$daysAgo, $status, $qty]) {
                $c = $customers[$i % $customers->count()];
                $at = $now->copy()->subDays($daysAgo)->setTime(10 + $i, 15);
                $total = (float) $p11->refill_price * $qty;
                $order = Order::forceCreate([
                    'order_number' => $prefix . str_pad((string) ($i + 1), 4, '0', STR_PAD_LEFT), 'customer_id' => $c->id, 'store_id' => $branch->id,
                    'transaction_type' => 'refill', 'status' => $status, 'total_amount' => $total, 'shipping_fee' => 50,
                    'payment_method' => 'cash', 'payment_status' => $status === 'delivered' ? 'paid' : 'unpaid', 'payment_mode' => 'cod',
                    'ordered_at' => $at, 'delivered_at' => $status === 'delivered' ? $at->copy()->addMinutes(50) : null,
                    'created_by' => $c->user_id, 'fulfillment' => 'delivery', 'delivery_latitude' => 14.3950000, 'delivery_longitude' => 120.9420000,
                    'created_at' => $at, 'updated_at' => $at,
                ]);
                OrderItem::forceCreate(['order_id' => $order->id, 'product_id' => $p11->id, 'quantity' => $qty, 'unit_price' => $p11->refill_price,
                    'subtotal' => $total, 'transaction_type' => 'refill']);
                if ($status === 'delivered') {
                    Delivery::forceCreate(['order_id' => $order->id, 'store_id' => $branch->id, 'rider_id' => $rider->id, 'vehicle_id' => $vehicleId,
                        'status' => 'delivered', 'assigned_at' => $at->copy()->addMinutes(5), 'delivered_at' => $at->copy()->addMinutes(50),
                        'created_at' => $at, 'updated_at' => $at]);
                }
            }
        }

        $this->command?->info("J9: {$main->store_name} is on paid Premium with branch \"{$branch->store_name}\" (branchmanager1@lpg.com / Password@123).");
    }
}
