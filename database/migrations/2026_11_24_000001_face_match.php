<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * J2 face matching (additive only):
 * - verification_requests: the Face++ result of ID vs selfie (customer ID verification and the seller-only owner ID)
 *   and whether the request was approved automatically (reviewed_by stays null then)
 * - staff_documents: the rider's live selfie for the driver's license + the same face result columns
 */
return new class extends Migration
{
    private function faceColumns(Blueprint $table, string $after): void
    {
        $table->string('face_match_status', 20)->nullable()->after($after);   // passed | failed | no_face | skipped | error
        $table->decimal('face_match_score', 5, 2)->nullable()->after('face_match_status');
        $table->decimal('face_match_needed', 5, 2)->nullable()->after('face_match_score');
        $table->string('face_match_message', 255)->nullable()->after('face_match_needed');
        $table->boolean('auto_approved')->default(false)->after('face_match_message');
        $table->timestamp('face_checked_at')->nullable()->after('auto_approved');
    }

    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $this->faceColumns($table, 'selfie_path');
        });

        Schema::table('staff_documents', function (Blueprint $table) {
            $table->string('selfie_path')->nullable()->after('file_path');
            $this->faceColumns($table, 'selfie_path');
        });
    }

    public function down(): void
    {
        $cols = ['face_match_status', 'face_match_score', 'face_match_needed', 'face_match_message', 'auto_approved', 'face_checked_at'];

        Schema::table('verification_requests', fn (Blueprint $table) => $table->dropColumn($cols));
        Schema::table('staff_documents', fn (Blueprint $table) => $table->dropColumn(['selfie_path', ...$cols]));
    }
};
