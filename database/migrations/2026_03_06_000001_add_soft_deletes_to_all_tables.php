<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $tables = [
            'users',
            'customers',
            'products',
            'inventories',
            'orders',
            'order_items',
            'deliveries',
            'invoices',
            'dss_logs',
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->softDeletes();
            });
        }
    }

    public function down(): void
    {
        $tables = [
            'users',
            'customers',
            'products',
            'inventories',
            'orders',
            'order_items',
            'deliveries',
            'invoices',
            'dss_logs',
        ];

        foreach ($tables as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropSoftDeletes();
            });
        }
    }
};
