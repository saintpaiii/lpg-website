<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('withdrawal_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->enum('payment_method', ['gcash', 'bank_transfer', 'maya', 'cash']);
            $table->string('account_name');
            $table->string('account_number');
            $table->string('reference_number')->nullable();
            $table->enum('status', ['pending', 'approved', 'released', 'received', 'rejected'])->default('pending');
            $table->text('rejection_reason')->nullable();
            $table->timestamp('requested_at');
            $table->timestamp('released_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('withdrawal_requests');
    }
};
