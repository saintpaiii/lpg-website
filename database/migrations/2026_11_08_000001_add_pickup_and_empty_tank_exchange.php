<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pick-up at the store (stores.allow_pickup, orders.fulfillment) and the refill empty-tank exchange
 * (orders.empty_tanks_required / _collected_at / _collected_by, order_items.transaction_type).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (! Schema::hasColumn('stores', 'allow_pickup')) {
                $table->boolean('allow_pickup')->default(false);
            }
            if (! Schema::hasColumn('stores', 'pickup_instructions')) {
                $table->string('pickup_instructions', 255)->nullable();
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'fulfillment')) {
                $table->string('fulfillment', 10)->default('delivery')->index();
            }
            if (! Schema::hasColumn('orders', 'empty_tanks_required')) {
                $table->unsignedSmallInteger('empty_tanks_required')->default(0);
                $table->timestamp('empty_tanks_collected_at')->nullable();
                $table->foreignId('empty_tanks_collected_by')->nullable()->constrained('users')->nullOnDelete();
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('order_items', 'transaction_type')) {
                $table->string('transaction_type', 15)->nullable();
            }
        });

        // Backfill (query builder, includes soft-deleted rows): items get their order's type; ACTIVE refill orders
        // need their empty tanks (tanks only = products with a size). Delivered / cancelled history keeps 0.
        DB::table('orders')->orderBy('id')->select(['id', 'transaction_type', 'status'])
            ->chunkById(200, function ($orders) {
                foreach ($orders as $o) {
                    DB::table('order_items')->where('order_id', $o->id)->whereNull('transaction_type')
                        ->update(['transaction_type' => $o->transaction_type]);

                    if ($o->transaction_type === 'refill'
                        && in_array($o->status, ['pending', 'confirmed', 'preparing', 'out_for_delivery'], true)) {
                        $tanks = (int) DB::table('order_items')->where('order_id', $o->id)
                            ->whereIn('product_id', DB::table('products')->where('weight_kg', '>', 0)->select('id'))
                            ->sum('quantity');
                        DB::table('orders')->where('id', $o->id)->update(['empty_tanks_required' => $tanks]);
                    }
                }
            });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'empty_tanks_collected_by')) {
                $table->dropForeign(['empty_tanks_collected_by']);
            }
            if (Schema::hasColumn('orders', 'fulfillment')) {
                $table->dropIndex(['fulfillment']);
            }
        });
        Schema::table('orders', function (Blueprint $table) {
            foreach (['fulfillment', 'empty_tanks_required', 'empty_tanks_collected_at', 'empty_tanks_collected_by'] as $c) {
                if (Schema::hasColumn('orders', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'transaction_type')) {
                $table->dropColumn('transaction_type');
            }
        });
        Schema::table('stores', function (Blueprint $table) {
            foreach (['allow_pickup', 'pickup_instructions'] as $c) {
                if (Schema::hasColumn('stores', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
    }
};
