<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reports: outcome (verdict) when closed, resolution photos, admin reminders to the store, and
 * "website problem" reports (type 'system_report': area, page, browser). New status
 * 'investigating' and type 'system_report' fit the existing string columns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->string('verdict', 30)->nullable()->after('resolution');
            $table->foreignId('verdict_by')->nullable()->after('verdict')->constrained('users')->nullOnDelete();
            $table->timestamp('verdict_at')->nullable()->after('verdict_by');
            $table->json('resolution_photos')->nullable()->after('verdict_at');
            $table->string('system_area', 60)->nullable();
            $table->string('page_url', 500)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('store_reminded_at')->nullable();
            $table->timestamp('resolution_proposed_at')->nullable();

            $table->index('verdict', 'user_reports_verdict_index');
            $table->index(['type', 'status'], 'user_reports_type_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropIndex('user_reports_verdict_index');
            $table->dropIndex('user_reports_type_status_index');
        });
        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verdict_by');
            $table->dropColumn(['verdict', 'verdict_at', 'resolution_photos', 'system_area', 'page_url', 'user_agent',
                'store_reminded_at', 'resolution_proposed_at']);
        });
        // Values the earlier migrations' rollbacks know how to handle
        DB::table('user_reports')->where('status', 'investigating')->update(['status' => 'under_review']);
        DB::table('user_reports')->where('type', 'system_report')->update(['type' => 'buyer_report']);
    }
};
