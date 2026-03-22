<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('verification_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['customer_id_verification', 'seller_application']);

            // Uploaded document paths (nullable — different types need different docs)
            $table->string('valid_id_path')->nullable();
            $table->string('bir_permit_path')->nullable();
            $table->string('business_permit_path')->nullable();

            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');

            // Reviewer audit
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('rejection_reason')->nullable();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('verification_requests');
    }
};
