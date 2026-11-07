<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Review photos (up to 3 per review, public disk 'reviews/photos'), edit tracking and admin photo removals,
 * plus the seller-defined refund window (days after delivery) with a per-order snapshot taken at checkout.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ratings', function (Blueprint $table) {
            $table->json('photo_paths')->nullable()->after('review');
            $table->timestamp('edited_at')->nullable()->after('photo_paths');
            $table->unsignedTinyInteger('photos_removed_by_admin')->default(0)->after('edited_at');
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->unsignedSmallInteger('refund_window_days')->default(7);
        });

        Schema::table('orders', function (Blueprint $table) {
            // null = order placed before refund windows existed → the store's current window applies
            $table->unsignedSmallInteger('refund_window_days')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ratings', function (Blueprint $table) {
            $table->dropColumn(['photo_paths', 'edited_at', 'photos_removed_by_admin']);
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn('refund_window_days');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('refund_window_days');
        });
    }
};
