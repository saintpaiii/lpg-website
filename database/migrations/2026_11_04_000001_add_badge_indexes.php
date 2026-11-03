<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sidebar badges count "changed since your last visit" per section (SidebarBadgeService):
 * scope column + updated_at (or created_at) so each count is one index range scan.
 */
return new class extends Migration
{
    /** table => [[columns], index name] */
    private const INDEXES = [
        'orders'                     => [[['store_id', 'updated_at'], 'orders_store_updated_idx'], [['customer_id', 'updated_at'], 'orders_customer_updated_idx']],
        'deliveries'                 => [[['store_id', 'updated_at'], 'deliveries_store_updated_idx'], [['rider_id', 'updated_at'], 'deliveries_rider_updated_idx']],
        'refund_requests'            => [[['store_id', 'updated_at'], 'refunds_store_updated_idx'], [['customer_id', 'updated_at'], 'refunds_customer_updated_idx'], [['escalated_to_admin', 'updated_at'], 'refunds_escalated_updated_idx']],
        'invoices'                   => [[['customer_id', 'updated_at'], 'invoices_customer_updated_idx']],
        'verification_requests'      => [[['type', 'updated_at'], 'verifications_type_updated_idx']],
        'store_document_submissions' => [[['store_id', 'updated_at'], 'store_docs_store_updated_idx'], [['updated_at'], 'store_docs_updated_idx']],
        'staff_documents'            => [[['store_id', 'updated_at'], 'staff_docs_store_updated_idx'], [['user_id', 'updated_at'], 'staff_docs_user_updated_idx']],
        'ratings'                    => [[['store_id', 'created_at'], 'ratings_store_created_idx']],
        'user_reports'               => [[['reported_store_id', 'updated_at'], 'user_reports_store_updated_idx'], [['updated_at'], 'user_reports_updated_idx']],
        'stores'                     => [[['created_at'], 'stores_created_idx']],
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            foreach ($indexes as [$columns, $name]) {
                if (Schema::hasIndex($table, $name) || array_diff($columns, Schema::getColumnListing($table))) {
                    continue;
                }
                Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        foreach (self::INDEXES as $table => $indexes) {
            foreach ($indexes as [, $name]) {
                if (Schema::hasTable($table) && Schema::hasIndex($table, $name)) {
                    Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
                }
            }
        }
    }
};
