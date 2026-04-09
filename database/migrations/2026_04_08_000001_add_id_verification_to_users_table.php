<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('valid_id_path')->nullable()->after('id_verified');
            $table->string('selfie_path')->nullable()->after('valid_id_path');
            $table->timestamp('id_verified_at')->nullable()->after('selfie_path');
            $table->enum('id_verification_status', ['pending', 'verified', 'rejected'])
                  ->default('pending')
                  ->after('id_verified_at');
            $table->text('id_rejection_reason')->nullable()->after('id_verification_status');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'valid_id_path',
                'selfie_path',
                'id_verified_at',
                'id_verification_status',
                'id_rejection_reason',
            ]);
        });
    }
};
