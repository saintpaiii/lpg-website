<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * K1 (additive only): users.needs_account_choice — a NEW "Continue with Google" user hasn't picked
 * "I want to buy LPG" / "I only want to sell LPG" yet and is kept on /choose-account until they do
 * (seller only: until the store application is submitted). Existing users keep false.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('needs_account_choice')->default(false)->after('can_shop');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('needs_account_choice');
        });
    }
};
