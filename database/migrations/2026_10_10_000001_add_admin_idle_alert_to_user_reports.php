<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** When admins were told "Store hasn't responded for 24 hours" (sent once per report). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->timestamp('admin_idle_alert_sent_at')->nullable()->after('store_reminded_at');
        });
    }

    public function down(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropColumn('admin_idle_alert_sent_at');
        });
    }
};
