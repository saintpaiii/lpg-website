<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Extend wallet_transactions.type enum to include refund_deduction
        DB::statement("ALTER TABLE wallet_transactions MODIFY type ENUM('credit', 'withdrawal', 'refund_deduction') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE wallet_transactions MODIFY type ENUM('credit', 'withdrawal') NOT NULL");
    }
};
