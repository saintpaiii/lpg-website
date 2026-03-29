<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add bank_name column (nullable — only used for bank_transfer)
        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->string('bank_name')->nullable()->after('account_number');
        });

        // Remove 'cash' from payment_method enum
        DB::statement("ALTER TABLE withdrawal_requests MODIFY payment_method ENUM('gcash','bank_transfer','maya') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE withdrawal_requests MODIFY payment_method ENUM('gcash','bank_transfer','maya','cash') NOT NULL");

        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->dropColumn('bank_name');
        });
    }
};
