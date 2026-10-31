<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('fail_reason', 40)->nullable()->after('notes');        // key from config('delivery.fail_reasons')
            $table->date('redeliver_on')->nullable()->after('fail_reason');
            $table->string('redeliver_slot', 20)->nullable()->after('redeliver_on'); // morning | afternoon | evening
            $table->timestamp('failed_at')->nullable()->after('redeliver_slot');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn(['fail_reason', 'redeliver_on', 'redeliver_slot', 'failed_at']);
        });
    }
};
