<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Terms & Policies: admin-editable documents with versions, and who agreed to which version.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legal_documents', function (Blueprint $table) {
            $table->id();
            $table->string('type', 30);                       // customer_terms | seller_terms | privacy_policy
            $table->unsignedInteger('version')->nullable();   // null while draft
            $table->string('title');
            $table->longText('body');                          // Markdown
            $table->string('change_summary', 500)->nullable();
            $table->boolean('is_major')->default(true);
            $table->timestamp('published_at')->nullable();     // null = draft
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'published_at'], 'legal_docs_type_published_idx');
            $table->unique(['type', 'version'], 'legal_docs_type_version_unique');
        });

        Schema::create('legal_acceptances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Only drafts are ever deleted and drafts have no acceptances — records must never disappear
            $table->foreignId('legal_document_id')->constrained('legal_documents')->restrictOnDelete();
            $table->timestamp('accepted_at');
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->string('context', 30);                     // registration | seller_application | update_popup
            $table->timestamps();

            $table->unique(['user_id', 'legal_document_id'], 'legal_acc_user_doc_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_acceptances');
        Schema::dropIfExists('legal_documents');
    }
};
