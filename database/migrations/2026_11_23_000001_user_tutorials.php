<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * First-time tutorials (driver.js): which tours a user finished or skipped, saved on the account so a tour never
 * runs twice (not even on another device). Existing users start with nothing seen — every tour is new to them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('tutorials')->nullable();                      // { "<tourKey>": { "done": ISO|null, "skipped": ISO|null } }
            $table->boolean('tutorials_enabled')->default(true);        // "Show tutorials automatically"
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['tutorials', 'tutorials_enabled']);
        });
    }
};
