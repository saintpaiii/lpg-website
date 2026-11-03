<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When a user last opened a section (My Orders, My Refunds, My Invoices) — the sidebar shows
 * "new since your last visit" badges from it (SidebarBadgeService).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('section_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('section', 30);
            $table->timestamp('visited_at');
            $table->unique(['user_id', 'section']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('section_visits');
    }
};
