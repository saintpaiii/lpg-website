<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Plan limits: products / staff / vehicles over the store's plan limit are paused (never deleted).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('products', 'paused_by_plan')) {
            Schema::table('products', function (Blueprint $table) {
                $table->boolean('paused_by_plan')->default(false)->after('is_active');
                $table->index(['store_id', 'paused_by_plan']);
            });
        }
        if (! Schema::hasColumn('users', 'paused_by_plan')) {
            Schema::table('users', function (Blueprint $table) {
                $table->boolean('paused_by_plan')->default(false)->after('is_active');
            });
        }
        if (! Schema::hasColumn('vehicles', 'paused_by_plan')) {
            Schema::table('vehicles', function (Blueprint $table) {
                $table->boolean('paused_by_plan')->default(false)->after('status');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('products', 'paused_by_plan')) {
            Schema::table('products', function (Blueprint $table) {
                $table->dropIndex(['store_id', 'paused_by_plan']);
                $table->dropColumn('paused_by_plan');
            });
        }
        foreach (['users', 'vehicles'] as $t) {
            if (Schema::hasColumn($t, 'paused_by_plan')) {
                Schema::table($t, fn (Blueprint $table) => $table->dropColumn('paused_by_plan'));
            }
        }
    }
};
