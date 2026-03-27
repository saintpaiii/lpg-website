<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->string('fsic_permit')->nullable()->after('business_permit');
            $table->string('doe_lpg_license')->nullable()->after('fsic_permit');
            $table->string('lto_permit')->nullable()->after('doe_lpg_license');
        });

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->string('fsic_permit_path')->nullable()->after('business_permit_path');
            $table->string('doe_lpg_license_path')->nullable()->after('fsic_permit_path');
            $table->string('lto_permit_path')->nullable()->after('doe_lpg_license_path');
            $table->timestamp('terms_agreed_at')->nullable()->after('rejection_reason');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn(['fsic_permit', 'doe_lpg_license', 'lto_permit']);
        });

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn(['fsic_permit_path', 'doe_lpg_license_path', 'lto_permit_path', 'terms_agreed_at']);
        });
    }
};
