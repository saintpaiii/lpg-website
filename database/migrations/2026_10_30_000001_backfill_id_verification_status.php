<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Accounts already approved through the old id_verified flag (admins, staff, approved sellers)
        DB::table('users')
            ->where('id_verified', true)
            ->where('id_verification_status', 'pending')
            ->update([
                'id_verification_status' => 'verified',
                'id_verified_at'         => DB::raw('COALESCE(id_verified_at, NOW())'),
            ]);

        // Demo customers (customer1@lpg.com … customer5@lpg.com)
        DB::table('users')
            ->where('role', 'customer')
            ->where('email', 'like', 'customer%@lpg.com')
            ->update([
                'id_verified'            => true,
                'id_verification_status' => 'verified',
                'id_verified_at'         => DB::raw('COALESCE(id_verified_at, NOW())'),
            ]);
    }

    public function down(): void
    {
        // Data backfill only — nothing to undo.
    }
};
