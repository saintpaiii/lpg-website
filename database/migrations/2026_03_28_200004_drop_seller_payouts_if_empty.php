<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('seller_payouts') && \DB::table('seller_payouts')->count() === 0) {
            Schema::dropIfExists('seller_payouts');
        }
    }

    public function down(): void
    {
        // Cannot reliably recreate if dropped — no-op
    }
};
