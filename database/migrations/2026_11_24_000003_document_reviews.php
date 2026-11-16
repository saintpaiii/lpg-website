<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * J3 (additive only):
 * - stores.document_reviews — the admin's per-document decisions on a store application, saved as each one is made:
 *   {doc_key: {status: accepted|rejected, reason, note, by_id, by_name, at, expires_at}}
 *   doc_key = valid_id | bir_permit | business_permit | fsic_permit | doe_lpg_license | dti_sec_registration | other-{id}
 *             | address_pin | duplicates
 * - stores.dti_sec_expires_at — the DTI Business Name certificate's "valid until" (5 years; DTI only — SEC never expires)
 * The renewal flow needs nothing new: store_document_submissions.expires_at already holds the date the admin confirms.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->json('document_reviews')->nullable()->after('approval_checks');
            $table->date('dti_sec_expires_at')->nullable()->after('doe_lpg_license_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['document_reviews', 'dti_sec_expires_at']);
        });
    }
};
