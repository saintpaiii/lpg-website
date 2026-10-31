<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Failed deliveries get an estimated redelivery RANGE (redeliver_on = from, redeliver_until = to)
 * instead of one day + time slot — riders can't promise an exact time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->date('redeliver_until')->nullable()->after('redeliver_on');
        });

        // Existing single-day estimates become a one-day range
        DB::table('deliveries')->whereNotNull('redeliver_on')->update(['redeliver_until' => DB::raw('redeliver_on')]);

        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn('redeliver_slot');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('redeliver_slot', 20)->nullable()->after('redeliver_on');
        });
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn('redeliver_until');
        });
    }
};
