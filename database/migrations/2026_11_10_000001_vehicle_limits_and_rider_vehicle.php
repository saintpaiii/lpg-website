<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * a) Vehicles above their type's legal maximum (RA 11592: no loading beyond a vehicle's capacity) are clamped down to it.
 * b) attendances.vehicle_id — the vehicle a rider took for the shift (held until clock-out).
 */
return new class extends Migration
{
    public function up(): void
    {
        $types = config('delivery.vehicle_types', []);
        DB::table('vehicles')->orderBy('id')->chunkById(200, function ($vehicles) use ($types) {
            foreach ($vehicles as $v) {
                $maxKg    = (float) ($types[$v->vehicle_type]['max_kg'] ?? 0);
                $maxTanks = (int) ($types[$v->vehicle_type]['max_tanks'] ?? 0);
                if ($maxKg <= 0 || $maxTanks <= 0) {
                    continue;
                }
                $kg    = min((float) $v->max_capacity_kg, $maxKg);
                $tanks = min((int) $v->max_tanks, $maxTanks);
                if ($kg != (float) $v->max_capacity_kg || $tanks != (int) $v->max_tanks) {
                    DB::table('vehicles')->where('id', $v->id)->update(['max_capacity_kg' => $kg, 'max_tanks' => $tanks]);
                    $msg = "Vehicle {$v->plate_number} ({$v->vehicle_type}) clamped to the legal maximum: "
                        . "{$v->max_tanks} tanks / {$v->max_capacity_kg} kg → {$tanks} tanks / {$kg} kg";
                    Log::info($msg);
                    echo "  {$msg}\n";
                }
            }
        });

        if (! Schema::hasColumn('attendances', 'vehicle_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('attendances', 'vehicle_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->dropForeign(['vehicle_id']);
                $table->dropColumn('vehicle_id');
            });
        }
        // The clamp is not undone (values above the legal maximum are not restored)
    }
};
