<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Monthly store subscription plans (Basic / Pro / Premium + a one-time 30-day Premium trial), prepaid for
 * 30 days through PayMongo. Stores already approved at deploy time start their trial now.
 * Every step is guarded so it runs on the live database and on a fresh install.
 */
return new class extends Migration
{
    private const PLANS = [
        ['key' => 'basic',   'name' => 'Basic',   'price' => 499,  'max_products' => 15,   'max_staff' => 3,    'max_vehicles' => 2,    'sort_order' => 1],
        ['key' => 'pro',     'name' => 'Pro',     'price' => 999,  'max_products' => 50,   'max_staff' => 10,   'max_vehicles' => 5,    'sort_order' => 2],
        ['key' => 'premium', 'name' => 'Premium', 'price' => 1799, 'max_products' => null, 'max_staff' => null, 'max_vehicles' => null, 'sort_order' => 3],
    ];

    public function up(): void
    {
        // a) Plans
        if (! Schema::hasTable('subscription_plans')) {
            Schema::create('subscription_plans', function (Blueprint $t) {
                $t->id();
                $t->string('key', 20)->unique();
                $t->string('name', 40);
                $t->decimal('price', 10, 2);
                $t->unsignedInteger('max_products')->nullable();   // null = unlimited
                $t->unsignedInteger('max_staff')->nullable();
                $t->unsignedInteger('max_vehicles')->nullable();
                $t->tinyInteger('sort_order')->default(0);
                $t->timestamps();
            });
        }
        foreach (self::PLANS as $plan) {
            if (! DB::table('subscription_plans')->where('key', $plan['key'])->exists()) {
                DB::table('subscription_plans')->insert($plan + ['created_at' => now(), 'updated_at' => now()]);
            }
        }

        // b) Payments (also trial and free-day rows)
        if (! Schema::hasTable('subscription_payments')) {
            Schema::create('subscription_payments', function (Blueprint $t) {
                $t->id();
                $t->foreignId('store_id')->constrained()->cascadeOnDelete();
                $t->string('plan_key', 20);
                $t->decimal('amount', 10, 2)->default(0);
                $t->string('status', 20)->default('pending');      // pending | paid | cancelled
                $t->string('method', 20);                           // paymongo | cash | trial | gift
                $t->string('paymongo_checkout_id')->nullable()->index();
                $t->string('reference', 100)->nullable();
                $t->string('receipt_number', 30)->nullable()->unique();
                $t->timestamp('period_start')->nullable();
                $t->timestamp('period_end')->nullable();
                $t->unsignedSmallInteger('days')->default(30);
                $t->timestamp('paid_at')->nullable();
                $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $t->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
                $t->string('notes', 500)->nullable();
                $t->timestamps();
                $t->index(['store_id', 'status']);
            });
        }

        // c) Store columns — the old enum can't hold 'none', so widen it first
        if (Schema::hasColumn('stores', 'subscription_plan')) {
            Schema::table('stores', fn (Blueprint $t) => $t->string('subscription_plan', 20)->default('none')->change());
            DB::table('stores')->where('subscription_plan', 'free')->update(['subscription_plan' => 'none']);
        }
        Schema::table('stores', function (Blueprint $t) {
            if (! Schema::hasColumn('stores', 'subscription_started_at')) {
                $t->timestamp('subscription_started_at')->nullable()->after('subscription_plan');
            }
            if (! Schema::hasColumn('stores', 'trial_used_at')) {
                $t->timestamp('trial_used_at')->nullable();
            }
            if (! Schema::hasColumn('stores', 'plan_reminder_sent_on')) {
                $t->date('plan_reminder_sent_on')->nullable();
            }
            if (! Schema::hasColumn('stores', 'plan_expired_notified_at')) {
                $t->timestamp('plan_expired_notified_at')->nullable();
            }
        });

        // d) Old scaffold (demo data only)
        Schema::dropIfExists('store_subscriptions');

        // e) Approved stores start the 30-day Premium trial now; everyone else has no plan
        $now = now();
        $end = $now->copy()->addDays(30);
        $approved = DB::table('stores')->where('status', 'approved')->whereNull('deleted_at')->whereNull('trial_used_at')->pluck('id');
        $seq = $this->lastReceiptSequence($now);

        foreach ($approved as $storeId) {
            DB::table('stores')->where('id', $storeId)->update([
                'subscription_plan'        => 'trial',
                'subscription_started_at'  => $now,
                'subscription_expires_at'  => $end,
                'trial_used_at'            => $now,
                'is_featured'              => true,
                'plan_reminder_sent_on'    => null,
                'plan_expired_notified_at' => null,
            ]);
            DB::table('subscription_payments')->insert([
                'store_id'       => $storeId,
                'plan_key'       => 'trial',
                'amount'         => 0,
                'status'         => 'paid',
                'method'         => 'trial',
                'receipt_number' => sprintf('SUB-%s-%03d', $now->format('Y-m'), ++$seq),
                'period_start'   => $now,
                'period_end'     => $end,
                'days'           => 30,
                'paid_at'        => $now,
                'notes'          => 'Free 30-day Premium trial',
                'created_at'     => $now,
                'updated_at'     => $now,
            ]);
        }

        DB::table('stores')->where(fn ($q) => $q->where('status', '!=', 'approved')->orWhereNotNull('deleted_at'))
            ->whereNull('trial_used_at')
            ->update(['subscription_plan' => 'none', 'subscription_expires_at' => null, 'is_featured' => false]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
        Schema::dropIfExists('subscription_plans');
        Schema::table('stores', function (Blueprint $t) {
            foreach (['subscription_started_at', 'trial_used_at', 'plan_reminder_sent_on', 'plan_expired_notified_at'] as $c) {
                if (Schema::hasColumn('stores', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }

    /** Highest SUB-YYYY-MM-### number already used this month. */
    private function lastReceiptSequence($now): int
    {
        $last = DB::table('subscription_payments')->where('receipt_number', 'like', 'SUB-' . $now->format('Y-m') . '-%')
            ->orderByRaw('LENGTH(receipt_number) DESC')->orderByDesc('receipt_number')->value('receipt_number');

        return $last ? (int) substr($last, strrpos($last, '-') + 1) : 0;
    }
};
