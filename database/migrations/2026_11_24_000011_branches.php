<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * J9 — Branches (Premium only).
 *  - stores.parent_store_id / branch_name: a branch is a normal store row of the same owner (user_id) whose
 *    parent_store_id points to the MAIN store. Existing stores are main stores (parent NULL) — nothing changes for them.
 *  - stock_transfers (+ items, + the source batches each line took) between stores of one owner.
 *  - inventory_transactions.type gains transfer_out / transfer_in.
 *  - the inventory.transfer permission row (per-person overrides need it; roles get it from config/staff_modules.php).
 *  - Seller Terms: a MINOR version (nobody re-accepts) with the 14-day trial and "branches are Premium only".
 */
return new class extends Migration
{
    private const OLD_TYPES = "'in','out','adjustment','order','cancelled','empty_in','empty_out','damaged','returned_to_supplier','expired'";
    private const NEW_TYPES = "'in','out','adjustment','order','cancelled','empty_in','empty_out','damaged','returned_to_supplier','expired','transfer_out','transfer_in'";

    private const TERMS_SUMMARY = 'Free trial is now 14 days; branches (Premium only) — J9.';
    private const TERMS_OLD = '- After your store is approved, it gets a free 30-day Premium trial (once per store).';
    private const TERMS_NEW = "- After your store is approved, it gets a free 14-day Premium trial (once per store; each approved branch gets its own).\n"
        . '- Branches (more outlets under the same owner) are available only while your main store is on a paid Premium plan. Each branch needs its own Business / Mayor\'s Permit, FSIC and DOE License to Operate, is reviewed by the Platform, and has its own plan.';

    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->foreignId('parent_store_id')->nullable()->after('user_id')->constrained('stores')->restrictOnDelete();
            $table->string('branch_name', 60)->nullable()->after('store_name');
            $table->index(['user_id', 'parent_store_id']);
            $table->unique(['parent_store_id', 'branch_name']);
        });

        Schema::create('stock_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('from_store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('to_store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('transfer_number', 20);
            $table->enum('status', ['sent', 'received', 'cancelled'])->default('sent');
            $table->text('notes')->nullable();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->unique(['owner_id', 'transfer_number']);
            $table->index(['from_store_id', 'status']);
            $table->index(['to_store_id', 'status']);
        });

        Schema::create('stock_transfer_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_transfer_id')->constrained('stock_transfers')->cascadeOnDelete();
            $table->foreignId('from_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('to_product_id')->constrained('products')->cascadeOnDelete();
            $table->boolean('empties')->default(false);   // EMPTY cylinders (inventories.empty_quantity) instead of filled
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('quantity_received')->nullable();
            $table->foreignId('cylinder_incident_id')->nullable()->constrained('cylinder_incidents')->nullOnDelete();   // shortfall
            $table->timestamps();
        });

        // Which source batches a line took (undated stock = no row) — receiving copies their dates, cancel puts them back
        Schema::create('stock_transfer_item_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_transfer_item_id')->constrained('stock_transfer_items')->cascadeOnDelete();
            $table->foreignId('cylinder_batch_id')->constrained('cylinder_batches')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->timestamps();
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE inventory_transactions MODIFY COLUMN type ENUM(' . self::NEW_TYPES . ') NOT NULL');
        }

        if (Schema::hasTable('permissions') && ! DB::table('permissions')->where('name', 'inventory.transfer')->exists()) {
            DB::table('permissions')->insert(['name' => 'inventory.transfer', 'group' => 'Inventory',
                'description' => 'Send and receive stock transfers between the owner\'s stores', 'created_at' => now(), 'updated_at' => now()]);
        }

        $this->publishTerms();
    }

    public function down(): void
    {
        // Seller Terms: the J9 version goes unless someone accepted it (acceptances are proof)
        if (Schema::hasTable('legal_documents')) {
            $ids = DB::table('legal_documents')->where('type', 'seller_terms')->where('change_summary', self::TERMS_SUMMARY)->pluck('id');
            $accepted = Schema::hasTable('legal_acceptances')
                ? DB::table('legal_acceptances')->whereIn('legal_document_id', $ids)->pluck('legal_document_id')->unique() : collect();
            DB::table('legal_documents')->whereIn('id', $ids->diff($accepted))->delete();
            foreach (DB::table('legal_documents')->where('type', 'seller_terms')->whereNull('published_at')->get(['id', 'body']) as $d) {
                if (str_contains((string) $d->body, self::TERMS_NEW)) {
                    DB::table('legal_documents')->where('id', $d->id)->update(['body' => str_replace(self::TERMS_NEW, self::TERMS_OLD, (string) $d->body)]);
                }
            }
        }

        if (Schema::hasTable('permissions')) {
            $id = DB::table('permissions')->where('name', 'inventory.transfer')->value('id');
            if ($id) {
                DB::table('user_permissions')->where('permission_id', $id)->delete();
                if (Schema::hasTable('role_permissions')) {
                    DB::table('role_permissions')->where('permission_id', $id)->delete();
                }
                DB::table('permissions')->where('id', $id)->delete();
            }
        }

        if (DB::getDriverName() === 'mysql') {
            DB::table('inventory_transactions')->whereIn('type', ['transfer_out', 'transfer_in'])->update(['type' => 'adjustment']);
            DB::statement('ALTER TABLE inventory_transactions MODIFY COLUMN type ENUM(' . self::OLD_TYPES . ') NOT NULL');
        }

        Schema::dropIfExists('stock_transfer_item_batches');
        Schema::dropIfExists('stock_transfer_items');
        Schema::dropIfExists('stock_transfers');

        // Branch rows can't stay without their columns: they are removed with their data (rollback is for test databases)
        $branchIds = Schema::hasColumn('stores', 'parent_store_id') ? DB::table('stores')->whereNotNull('parent_store_id')->pluck('id') : collect();
        if ($branchIds->isNotEmpty()) {
            DB::table('users')->whereIn('store_id', $branchIds)->update(['store_id' => null]);
            DB::table('stores')->whereIn('id', $branchIds)->delete();
        }
        // Order matters on MySQL: an index can't go while a foreign key needs it. The (user_id, parent_store_id) index
        // also serves the stores.user_id foreign key (MySQL dropped that key's own index when this one was added), so a
        // plain user_id index comes back first. Each step is checked, so a half-finished rollback can be run again.
        $indexes = fn () => collect(Schema::getIndexes('stores'))->pluck('name')->all();
        $fks = fn () => collect(Schema::getForeignKeys('stores'))->pluck('name')->all();
        if (in_array('stores_parent_store_id_foreign', $fks(), true)) {
            Schema::table('stores', fn (Blueprint $t) => $t->dropForeign(['parent_store_id']));
        }
        if (! collect(Schema::getIndexes('stores'))->contains(fn ($i) => ($i['columns'][0] ?? null) === 'user_id' && $i['name'] !== 'stores_user_id_parent_store_id_index')) {
            Schema::table('stores', fn (Blueprint $t) => $t->index('user_id'));
        }
        if (in_array('stores_parent_store_id_branch_name_unique', $indexes(), true)) {
            Schema::table('stores', fn (Blueprint $t) => $t->dropUnique(['parent_store_id', 'branch_name']));
        }
        if (in_array('stores_user_id_parent_store_id_index', $indexes(), true)) {
            Schema::table('stores', fn (Blueprint $t) => $t->dropIndex(['user_id', 'parent_store_id']));
        }
        $cols = array_values(array_filter(['parent_store_id', 'branch_name'], fn ($c) => Schema::hasColumn('stores', $c)));
        if ($cols) {
            Schema::table('stores', fn (Blueprint $t) => $t->dropColumn($cols));
        }
    }

    private function publishTerms(): void
    {
        if (! Schema::hasTable('legal_documents')) {
            return;
        }
        $now = now();
        $latest = DB::table('legal_documents')->where('type', 'seller_terms')->whereNotNull('published_at')->orderByDesc('version')->first();
        if ($latest && str_contains((string) $latest->body, self::TERMS_OLD)) {
            DB::table('legal_documents')->insert([
                'type' => 'seller_terms', 'version' => (int) DB::table('legal_documents')->where('type', 'seller_terms')->max('version') + 1,
                'title' => $latest->title, 'body' => str_replace(self::TERMS_OLD, self::TERMS_NEW, (string) $latest->body),
                'change_summary' => self::TERMS_SUMMARY, 'is_major' => false, 'published_at' => $now,
                'published_by' => null, 'created_by' => null, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
        foreach (DB::table('legal_documents')->where('type', 'seller_terms')->whereNull('published_at')->get(['id', 'body']) as $d) {
            if (str_contains((string) $d->body, self::TERMS_OLD)) {
                DB::table('legal_documents')->where('id', $d->id)->update(['body' => str_replace(self::TERMS_OLD, self::TERMS_NEW, (string) $d->body), 'updated_at' => $now]);
            }
        }
    }
};
