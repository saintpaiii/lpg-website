<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The conversation inside a report: replies from the reporter, the store and the admin,
 * system notices (author NULL) and admin-only private notes (is_internal).
 * Existing resolutions / admin notes become the first updates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_report_id')->constrained('user_reports')->cascadeOnDelete();
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();   // NULL = system
            $table->string('author_side', 20);   // customer | store | rider | admin | system
            $table->text('body')->nullable();
            $table->json('attachments')->nullable();
            $table->boolean('is_internal')->default(false);   // admin-only private note
            $table->string('status_to', 30)->nullable();
            $table->timestamps();

            $table->index(['user_report_id', 'id']);
        });

        DB::table('user_reports')->orderBy('id')->chunkById(200, function ($reports) {
            foreach ($reports as $r) {
                if (filled($r->admin_notes)) {
                    DB::table('report_updates')->insert([
                        'user_report_id' => $r->id, 'author_id' => $r->resolved_by, 'author_side' => 'admin',
                        'body' => $r->admin_notes, 'is_internal' => true,
                        'created_at' => $r->updated_at, 'updated_at' => $r->updated_at,
                    ]);
                }
                if (filled($r->resolution)) {
                    $at = $r->resolved_at ?? $r->updated_at;
                    DB::table('report_updates')->insert([
                        'user_report_id' => $r->id, 'author_id' => $r->resolved_by, 'author_side' => 'admin',
                        'body' => $r->resolution, 'status_to' => $r->status, 'is_internal' => false,
                        'created_at' => $at, 'updated_at' => $at,
                    ]);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_updates');
    }
};
