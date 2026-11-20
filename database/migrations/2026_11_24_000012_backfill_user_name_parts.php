<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;

/**
 * K11 — accounts made before first_name / last_name existed (and every seeded demo account) have only `name`, so the
 * profile form showed empty First / Last name boxes. Split `name` into them where BOTH are empty. Only empty columns
 * are filled, so it is safe on live data (the same code: php artisan users:backfill-names).
 */
return new class extends Migration
{
    public function up(): void
    {
        User::backfillNameParts();
    }

    public function down(): void
    {
        // Nothing to undo: the filled columns are what the person would have typed.
    }
};
