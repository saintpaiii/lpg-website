<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Delivery fee per vehicle type (store_delivery_rates) replaces the store-wide flat / base / per-km fees.
 * The current fees are copied to every vehicle type a store owns, so a customer's fee doesn't change on deploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('store_delivery_rates')) {
            Schema::create('store_delivery_rates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('store_id')->constrained()->cascadeOnDelete();
                $table->string('vehicle_type', 20);
                $table->decimal('base_fee', 8, 2);
                $table->decimal('fee_per_km', 8, 2);
                $table->timestamps();
                $table->unique(['store_id', 'vehicle_type']);
            });
        }

        // Copy today's fees to every vehicle type each store owns
        if (Schema::hasColumn('stores', 'base_delivery_fee')) {
            DB::table('stores')->orderBy('id')->chunkById(100, function ($stores) {
                foreach ($stores as $s) {
                    $types = DB::table('vehicles')->where('store_id', $s->id)->whereNull('deleted_at')
                        ->where('status', '!=', 'retired')->distinct()->pluck('vehicle_type');
                    if ($types->isEmpty()) {
                        continue;
                    }
                    $hasPin = (float) $s->latitude != 0.0 && (float) $s->longitude != 0.0;
                    $base   = (float) $s->base_delivery_fee;
                    $perKm  = (float) $s->fee_per_km;
                    $flat   = (float) $s->delivery_fee;
                    [$rateBase, $ratePerKm] = match (true) {
                        ! $hasPin                       => [$flat, $perKm],   // no distance today → the flat fee
                        $base <= 0 && $perKm <= 0       => [$flat, 0.0],
                        default                         => [$base, $perKm],
                    };
                    foreach ($types as $type) {
                        DB::table('store_delivery_rates')->updateOrInsert(
                            ['store_id' => $s->id, 'vehicle_type' => $type],
                            ['base_fee' => $rateBase, 'fee_per_km' => $ratePerKm, 'created_at' => now(), 'updated_at' => now()],
                        );
                    }
                }
            });
        }

        if (! Schema::hasColumn('orders', 'delivery_vehicle_type')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('delivery_vehicle_type', 20)->nullable();
            });
        }

        foreach (['delivery_fee', 'base_delivery_fee', 'fee_per_km'] as $col) {
            if (Schema::hasColumn('stores', $col)) {
                Schema::table('stores', fn (Blueprint $table) => $table->dropColumn($col));
            }
        }

        // The admin "default delivery fee" setting was never read
        DB::table('settings')->where('key', 'default_delivery_fee')->delete();

        // Approved stores that can't deliver until they add a vehicle
        $noVehicle = DB::table('stores')->where('status', 'approved')->whereNull('deleted_at')
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('vehicles')->whereColumn('vehicles.store_id', 'stores.id')
                ->whereNull('vehicles.deleted_at')->whereIn('vehicles.status', ['available', 'in_use'])->where('vehicles.paused_by_plan', false))
            ->pluck('store_name');
        if ($noVehicle->isNotEmpty()) {
            $msg = 'Approved stores with no usable delivery vehicle (pick-up only until they add one): ' . $noVehicle->implode(', ');
            Log::warning($msg);
            echo "  {$msg}\n";
        }
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (! Schema::hasColumn('stores', 'delivery_fee')) {
                $table->decimal('delivery_fee', 8, 2)->default(0);
            }
            if (! Schema::hasColumn('stores', 'base_delivery_fee')) {
                $table->decimal('base_delivery_fee', 8, 2)->default(45);
            }
            if (! Schema::hasColumn('stores', 'fee_per_km')) {
                $table->decimal('fee_per_km', 8, 2)->default(10);
            }
        });

        if (Schema::hasTable('store_delivery_rates')) {
            foreach (DB::table('store_delivery_rates')->orderBy('base_fee')->get()->groupBy('store_id') as $storeId => $rates) {
                $cheapest = $rates->first();
                DB::table('stores')->where('id', $storeId)->update([
                    'delivery_fee'      => $cheapest->base_fee,
                    'base_delivery_fee' => $cheapest->base_fee,
                    'fee_per_km'        => $cheapest->fee_per_km,
                ]);
            }
        }

        if (! DB::table('settings')->where('key', 'default_delivery_fee')->exists()) {
            DB::table('settings')->insert(['key' => 'default_delivery_fee', 'value' => '0.00', 'created_at' => now(), 'updated_at' => now()]);
        }

        if (Schema::hasColumn('orders', 'delivery_vehicle_type')) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('delivery_vehicle_type'));
        }
        Schema::dropIfExists('store_delivery_rates');
    }
};
