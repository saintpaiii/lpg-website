<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The DOE License to Operate (RA 11592) IS the "LTO" — the separate LTO upload is replaced by the business-name
 * registration: DTI (single owner) or SEC (corporation / partnership). It never expires for platform purposes.
 * The old lto_permit columns stay (old files can still be opened).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('dti_sec_registration')->nullable();   // file path, local disk
            $table->string('dti_sec_kind', 3)->nullable();         // 'dti' | 'sec'
        });

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->string('dti_sec_registration_path')->nullable();
        });

        // A DTI/SEC upload through Store Documents carries its kind until the admin approves it
        Schema::table('store_document_submissions', function (Blueprint $table) {
            $table->string('dti_sec_kind', 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['dti_sec_registration', 'dti_sec_kind']);
        });

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn('dti_sec_registration_path');
        });

        Schema::table('store_document_submissions', function (Blueprint $table) {
            $table->dropColumn('dti_sec_kind');
        });
    }
};
