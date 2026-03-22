<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('deactivation_reason')->nullable()->after('is_active');
            $table->text('deactivation_notes')->nullable()->after('deactivation_reason');
            $table->timestamp('deactivated_at')->nullable()->after('deactivation_notes');
            $table->foreignId('deactivated_by')->nullable()->constrained('users')->nullOnDelete()->after('deactivated_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['deactivated_by']);
            $table->dropColumn(['deactivation_reason', 'deactivation_notes', 'deactivated_at', 'deactivated_by']);
        });
    }
};
