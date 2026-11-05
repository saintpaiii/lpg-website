<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** "Max per customer" counts per order (as before), per day or per week. */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('limit_period', 10)->default('order')->after('max_per_order');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('limit_period');
        });
    }
};
