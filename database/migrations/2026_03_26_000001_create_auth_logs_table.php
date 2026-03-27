<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email');
            $table->string('action', 30);        // login_success | login_failed | logout | password_changed | account_locked
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('status', 20);        // success | failed
            $table->string('failure_reason', 30)->nullable(); // invalid_password | account_deactivated | account_archived | email_not_found | too_many_attempts
            $table->timestamps();

            $table->index(['ip_address', 'created_at']);
            $table->index(['user_id',    'created_at']);
            $table->index(['status',     'created_at']);
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_logs');
    }
};
