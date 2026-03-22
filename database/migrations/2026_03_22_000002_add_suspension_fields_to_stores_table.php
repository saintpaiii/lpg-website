<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('suspension_reason')->nullable()->after('status');
            $table->text('suspension_notes')->nullable()->after('suspension_reason');
            $table->timestamp('suspended_at')->nullable()->after('suspension_notes');
            $table->foreignId('suspended_by')->nullable()->constrained('users')->nullOnDelete()->after('suspended_at');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropForeign(['suspended_by']);
            $table->dropColumn(['suspension_reason', 'suspension_notes', 'suspended_at', 'suspended_by']);
        });
    }
};
