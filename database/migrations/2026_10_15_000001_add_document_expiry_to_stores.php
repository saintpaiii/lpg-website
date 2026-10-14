<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permit expiry dates on stores, the "hidden because a permit expired" flag, and seller document
 * submissions (renewed permits and extra documents waiting for admin review).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->date('business_permit_expires_at')->nullable();
            $table->date('fsic_permit_expires_at')->nullable();
            $table->date('doe_lpg_license_expires_at')->nullable();
            $table->date('lto_permit_expires_at')->nullable();
            $table->boolean('documents_suspended')->default(false);
            $table->timestamp('documents_suspended_at')->nullable();
        });

        Schema::create('store_document_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->string('doc_type', 30);             // a StoreDocuments::TYPES key, or 'other'
            $table->string('label', 100)->nullable();   // required for 'other'
            $table->string('file_path');
            $table->date('expires_at')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('rejection_reason', 500)->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'doc_type', 'status'], 'store_docs_store_type_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_document_submissions');
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn([
                'business_permit_expires_at', 'fsic_permit_expires_at', 'doe_lpg_license_expires_at', 'lto_permit_expires_at',
                'documents_suspended', 'documents_suspended_at',
            ]);
        });
    }
};
