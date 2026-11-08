<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Auto-read (OCR) of the valid ID on a verification request (customer ID verification and seller applications).
 * Warnings only — the admin decides. The selfie is never read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->json('ocr')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn('ocr');
        });
    }
};
