<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reports get a route (who handles them: store / admin / both), urgency, a direct target
 * (customer / rider / product), and timestamps for the store-handling flow.
 *
 * type/category/status become strings so new values (rider reports, new categories,
 * 'awaiting_confirmation') fit. Existing rows stay admin-only (route 'admin'), and old seller
 * reports are repointed at the right customer (they stored a customers.id in a users column).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_reports', function (Blueprint $table) {
            $table->string('type', 30)->change();
            $table->string('category', 40)->change();
            $table->string('status', 30)->default('pending')->change();
        });

        Schema::table('user_reports', function (Blueprint $table) {
            $table->string('reporter_side', 20)->nullable()->after('type');   // customer | store | rider
            $table->string('target_type', 20)->nullable()->after('reporter_side');   // store | rider | product | customer
            $table->string('route', 10)->default('admin')->after('category');   // store | admin | both
            $table->boolean('is_urgent')->default(false)->after('route');
            $table->foreignId('reported_customer_id')->nullable()->after('reported_store_id')->constrained('customers')->nullOnDelete();
            $table->foreignId('reported_rider_id')->nullable()->after('reported_customer_id')->constrained('users')->nullOnDelete();
            $table->foreignId('reported_product_id')->nullable()->after('reported_rider_id')->constrained('products')->nullOnDelete();
            $table->string('waiting_on', 10)->nullable()->after('status');   // handler | reporter | NULL when closed
            $table->timestamp('store_assigned_at')->nullable();
            $table->timestamp('escalated_at')->nullable();
            $table->string('escalation_source', 20)->nullable();   // reporter | auto | admin
            $table->text('escalation_reason')->nullable();
            $table->timestamp('store_first_response_at')->nullable();
            $table->timestamp('store_marked_fixed_at')->nullable();
            $table->timestamp('reporter_confirmed_at')->nullable();
            $table->timestamp('last_activity_at')->nullable();

            $table->index(['reported_store_id', 'route', 'waiting_on'], 'user_reports_store_queue_index');
            $table->index(['status', 'last_activity_at'], 'user_reports_status_activity_index');
            $table->index(['reporter_id', 'status'], 'user_reports_reporter_status_index');
        });

        // Backfill existing rows (they were admin-only — keep them that way)
        DB::table('user_reports')->orderBy('id')->chunkById(200, function ($rows) {
            foreach ($rows as $r) {
                $update = [
                    'reporter_side'    => $r->type === 'seller_report' ? 'store' : 'customer',
                    'target_type'      => $r->type === 'seller_report' ? 'customer' : 'store',
                    'route'            => 'admin',
                    'waiting_on'       => in_array($r->status, ['pending', 'under_review'], true) ? 'handler' : null,
                    'last_activity_at' => $r->updated_at,
                ];
                // Old seller reports saved orders.customer (a customers.id) in reported_id (a users FK)
                if ($r->type === 'seller_report') {
                    $customer = $r->order_id
                        ? DB::table('orders')->leftJoin('customers', 'customers.id', '=', 'orders.customer_id')
                            ->where('orders.id', $r->order_id)->select('orders.customer_id', 'customers.user_id')->first()
                        : null;
                    $update['reported_customer_id'] = $customer?->customer_id;
                    $update['reported_id']          = $customer?->user_id;   // NULL for walk-in customers
                }
                DB::table('user_reports')->where('id', $r->id)->update($update);
            }
        });
    }

    public function down(): void
    {
        // The composite indexes may be serving the reported_store_id / reporter_id foreign keys —
        // give those their own single-column indexes back first (else MySQL error 1553).
        foreach (['reported_store_id', 'reporter_id'] as $col) {
            if (! Schema::hasIndex('user_reports', "user_reports_{$col}_foreign")) {
                Schema::table('user_reports', fn (Blueprint $t) => $t->index($col, "user_reports_{$col}_foreign"));
            }
        }

        Schema::table('user_reports', function (Blueprint $table) {
            $table->dropIndex('user_reports_store_queue_index');
            $table->dropIndex('user_reports_status_activity_index');
            $table->dropIndex('user_reports_reporter_status_index');
            $table->dropConstrainedForeignId('reported_customer_id');
            $table->dropConstrainedForeignId('reported_rider_id');
            $table->dropConstrainedForeignId('reported_product_id');
            $table->dropColumn([
                'reporter_side', 'target_type', 'route', 'is_urgent', 'waiting_on', 'store_assigned_at', 'escalated_at',
                'escalation_source', 'escalation_reason', 'store_first_response_at', 'store_marked_fixed_at',
                'reporter_confirmed_at', 'last_activity_at',
            ]);
        });

        // Map new values onto the old enums before converting back
        $oldCategories = ['fraud', 'fake_product', 'rude_behavior', 'non_delivery', 'overpricing', 'harassment', 'counterfeit', 'other'];
        DB::table('user_reports')->whereNotIn('category', $oldCategories)->update(['category' => 'other']);
        DB::table('user_reports')->where('status', 'awaiting_confirmation')->update(['status' => 'under_review']);
        DB::table('user_reports')->where('type', 'rider_report')->update(['type' => 'seller_report']);

        Schema::table('user_reports', function (Blueprint $table) use ($oldCategories) {
            $table->enum('type', ['buyer_report', 'seller_report'])->change();
            $table->enum('category', $oldCategories)->change();
            $table->enum('status', ['pending', 'under_review', 'resolved', 'dismissed'])->default('pending')->change();
        });
    }
};
