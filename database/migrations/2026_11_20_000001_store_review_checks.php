<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Seller review aids: the admin approval checklist, OCR results ("Auto-read" — warnings only, never decides),
 * duplicate-store warnings and SHA-256 hashes of the required documents (to spot a document reused by another store).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->json('approval_checks')->nullable();   // {items: {key: true}, note, by_id, by_name, at}
            $table->json('document_ocr')->nullable();      // {doc type | valid_id: {read_at, text, likely_expiry, found_tin, name_match, warnings}}
            $table->json('duplicate_flags')->nullable();   // {checked_at, matches: [{store_id, store_name, city, status, fields}]}
            $table->json('document_hashes')->nullable();   // {doc type: sha256}
        });

        Schema::table('store_document_submissions', function (Blueprint $table) {
            $table->json('ocr')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['approval_checks', 'document_ocr', 'duplicate_flags', 'document_hashes']);
        });

        Schema::table('store_document_submissions', function (Blueprint $table) {
            $table->dropColumn('ocr');
        });
    }
};
