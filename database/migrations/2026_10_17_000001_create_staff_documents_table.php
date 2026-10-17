<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Documents uploaded by store staff and riders (a rider's driver's license is required before delivering).
 * Reviewed by the store owner. Files are private ('local' disk).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('doc_type', 30);                 // drivers_license | police_clearance | … | other
            $table->string('label', 100)->nullable();       // required for 'other'
            $table->string('document_number', 50)->nullable(); // required for drivers_license
            $table->string('file_path');
            $table->date('expires_at')->nullable();          // required for drivers_license
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('rejection_reason', 500)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'doc_type', 'status'], 'staff_docs_user_type_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_documents');
    }
};
