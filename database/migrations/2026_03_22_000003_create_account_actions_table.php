<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_actions', function (Blueprint $table) {
            $table->id();
            $table->string('target_type'); // 'user' or 'store'
            $table->unsignedBigInteger('target_id');
            $table->string('action');      // deactivate, activate, archive, restore, suspend, unsuspend
            $table->string('reason')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_actions');
    }
};
